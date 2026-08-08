// Edge Function: process-nfce
// Recebe a URL do QR Code de uma NFC-e, busca o HTML da página da SEFAZ do
// estado correspondente e extrai os dados essenciais (emitente, chave de
// acesso, valor total).
//
// Deploy: supabase functions deploy process-nfce
// Invoke (client): supabase.functions.invoke('process-nfce', { body: { url } })

import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NfceResult {
    uf: string | null;
    chave_nfce: string | null;
    emitente: string | null;
    amount: number | null;
    raw_items_count: number | null;
}

// ---------------------------------------------------------------------------
// Utilidades gerais
// ---------------------------------------------------------------------------

function extractChaveFromUrl(url: string): string | null {
    // A chave de 44 dígitos normalmente vem no parâmetro p= (ex: SP, MG, RS...)
    const p = new URL(url).searchParams.get('p');
    if (p) {
        const chave = p.split('|')[0];
        if (/^\d{44}$/.test(chave)) return chave;
    }
    // fallback: procura 44 dígitos consecutivos em qualquer lugar da URL
    const match = url.match(/\b(\d{44})\b/);
    return match ? match[1] : null;
}

function parseCurrencyToNumber(text: string | null | undefined): number | null {
    if (!text) return null;
    const cleaned = text
        .replace(/[^\d,.-]/g, '')
        .replace(/\.(?=\d{3}(?:\D|$))/g, '') // remove separador de milhar
        .replace(',', '.');
    const value = parseFloat(cleaned);
    return Number.isNaN(value) ? null : value;
}

function detectUf(url: string): string | null {
    const host = new URL(url).host.toLowerCase();
    const UF_HOST_MAP: Record<string, string> = {
        'sefaz.sp.gov.br': 'SP',
        'nfce.fazenda.sp.gov.br': 'SP',
        'fazenda.sp.gov.br': 'SP',
        'nfce.fazenda.mg.gov.br': 'MG',
        'sefaz.mg.gov.br': 'MG',
        'nfce.sefaz.rs.gov.br': 'RS',
        'sefaz.rs.gov.br': 'RS',
        'nfce.sefaz.pr.gov.br': 'PR',
        'sefaz.pr.gov.br': 'PR',
        'nfce.sefaz.rj.gov.br': 'RJ',
        'sefaz.rj.gov.br': 'RJ',
        'nfce.sefaz.ba.gov.br': 'BA',
        'sefaz.ba.gov.br': 'BA',
    };
    for (const [fragment, uf] of Object.entries(UF_HOST_MAP)) {
        if (host.includes(fragment)) return uf;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Adaptadores por estado
//
// Cada UF publica o portal de consulta da NFC-e com um HTML/estrutura própria.
// Um adaptador recebe o Document parseado e devolve os campos que conseguir
// extrair. Comece implementando o estado que você mais usa e vá adicionando
// os demais aqui.
// ---------------------------------------------------------------------------

type Adapter = (doc: Document) => Partial<Pick<NfceResult, 'emitente' | 'amount' | 'raw_items_count'>>;

function textOf(doc: Document, selector: string): string | null {
    return doc.querySelector(selector)?.textContent?.trim() ?? null;
}

// Portal padrão usado por vários estados (SP, RS, PR, BA...) — baseado no
// layout genérico do "Consulta de NFC-e" da SEFAZ. Ajuste os seletores
// conforme o estado específico for testado.
const genericSefazAdapter: Adapter = (doc) => {
    const emitente = textOf(doc, '#u20, .txtTopo, .header .emitente') ?? undefined;
    const amountText =
        textOf(doc, '#linhaTotal .totalNumb, #valorTotal, .valorTotal') ?? undefined;
    const itemRows = doc.querySelectorAll('#tabResult tr, table.toggle tbody tr');

    return {
        emitente: emitente ?? null,
        amount: parseCurrencyToNumber(amountText ?? null),
        raw_items_count: itemRows?.length ?? null,
    };
};

// Exemplo de adaptador específico para Minas Gerais — preencher seletores
// reais quando formos testar contra o HTML de produção do estado.
const mgAdapter: Adapter = (doc) => {
    const emitente = textOf(doc, '.NFCCabecalho .Razao, #NomeFatura');
    const amountText = textOf(doc, '#NFeValorTotal, .valorTotal');
    const itemRows = doc.querySelectorAll('#tabResult tr');

    return {
        emitente,
        amount: parseCurrencyToNumber(amountText),
        raw_items_count: itemRows?.length ?? null,
    };
};

const ADAPTERS_BY_UF: Record<string, Adapter> = {
    MG: mgAdapter,
    // SP: spAdapter,
    // RS: rsAdapter,
    // RJ: rjAdapter,
    // Adicione outros estados aqui conforme forem mapeados/testados.
};

function getAdapterForUf(uf: string | null): Adapter {
    if (uf && ADAPTERS_BY_UF[uf]) return ADAPTERS_BY_UF[uf];
    return genericSefazAdapter;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: CORS_HEADERS });
    }

    try {
        const { url } = await req.json();

        if (!url || typeof url !== 'string') {
            return new Response(JSON.stringify({ error: 'Campo "url" é obrigatório.' }), {
                status: 400,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
        }

        const uf = detectUf(url);
        const chaveFromUrl = extractChaveFromUrl(url);

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; AgilisInput/1.0)',
            },
        });

        if (!response.ok) {
            throw new Error(`Falha ao buscar página da SEFAZ (status ${response.status})`);
        }

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        if (!doc) {
            throw new Error('Não foi possível interpretar o HTML retornado pela SEFAZ.');
        }

        const adapter = getAdapterForUf(uf);
        const parsed = adapter(doc);

        // Chave de acesso: se o adaptador não encontrar no HTML, cai no valor
        // já extraído da própria URL do QR Code (mais confiável na maioria dos casos).
        const chaveFromHtml = textOf(doc, '.chave, #chNFe, .chaveNFe');
        const chave_nfce =
            chaveFromHtml?.replace(/\D/g, '').match(/^\d{44}$/)?.[0] ?? chaveFromUrl ?? null;

        const result: NfceResult = {
            uf,
            chave_nfce,
            emitente: parsed.emitente ?? null,
            amount: parsed.amount ?? null,
            raw_items_count: parsed.raw_items_count ?? null,
        };

        return new Response(JSON.stringify(result), {
            status: 200,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    } catch (err) {
        console.error('process-nfce error:', err);
        return new Response(
            JSON.stringify({ error: err instanceof Error ? err.message : 'Erro desconhecido' }),
            { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        );
    }
});
