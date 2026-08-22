// Parses a single spoken phrase like "cinquenta e dois reais no Bar do Mirim no débito"
// Returns { amount, beneficiary, description, paymentType }

const WORD_NUMS = {
    zero: 0, um: 1, uma: 1, dois: 2, duas: 2, três: 3, quatro: 4, cinco: 5,
    seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
    treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16,
    dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30,
    quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80,
    noventa: 90, cem: 100, cento: 100, duzentos: 200, trezentos: 300,
    quatrocentos: 400, quinhentos: 500, seiscentos: 600, setecentos: 700,
    oitocentos: 800, novecentos: 900, mil: 1000,
};

const PAYMENT_KEYWORDS = {
    débito: 'debito', debito: 'debito',
    crédito: 'credito', credito: 'credito',
    cartão: 'credito', cartao: 'credito',
    dinheiro: 'dinheiro', espécie: 'dinheiro', especie: 'dinheiro',
    pix: 'pix',
};

export function wordsToNumber(words) {
    let total = 0, current = 0;
    for (const w of words) {
        const n = WORD_NUMS[w.toLowerCase()];
        if (n === undefined) continue;
        if (n === 1000) { total = (total + current) * n; current = 0; }
        else if (n >= 100) { current *= n; }
        else { current += n; }
    }
    return total + current;
}

// Extrai um único número (valor em reais ou contagem) de uma frase curta
// falada para um campo específico. Ex: "cinquenta reais", "3", "três".
export function parseSpokenNumber(phrase) {
    if (!phrase) return null;
    const numericMatch = phrase.match(/R?\$?\s*(\d+[.,]?\d*)/i);
    if (numericMatch) return parseFloat(numericMatch[1].replace(',', '.'));

    const lower = phrase.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const words = lower.split(/\s+/).filter(w => WORD_NUMS[w.replace(/[^a-z]/g, '')] !== undefined);
    if (words.length === 0) return null;
    return wordsToNumber(words);
}

export function parseVoicePhrase(phrase) {
    if (!phrase) return { amount: 0, beneficiary: '', description: '', paymentType: '' };

    const lower = phrase.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const words = lower.split(/\s+/);

    // 1. Detect payment type
    let paymentType = '';
    const cleanWords = [];
    for (const w of words) {
        const stripped = w.replace(/[^a-z]/g, '');
        if (PAYMENT_KEYWORDS[stripped]) {
            paymentType = PAYMENT_KEYWORDS[stripped];
        } else if (!['no', 'na', 'de', 'do', 'da', 'em', 'e'].includes(stripped)) {
            cleanWords.push(w);
        }
    }

    // 2. Try to extract numeric amount (digits like "52,90" or "R$52")
    let amount = 0;
    const numericMatch = phrase.match(/R?\$?\s*(\d+[.,]?\d*)/i);
    if (numericMatch) {
        amount = parseFloat(numericMatch[1].replace(',', '.'));
    }

    // 3. Try word-based amount if no numeric found
    if (!amount) {
        const reaisIdx = cleanWords.findIndex(w => /^reais?$/i.test(w));
        if (reaisIdx > 0) {
            amount = wordsToNumber(cleanWords.slice(0, reaisIdx));
            cleanWords.splice(0, reaisIdx + 1);
        }
    } else {
        // Remove the matched numeric token from cleanWords
        const numStr = numericMatch[0].trim();
        const idx = cleanWords.findIndex(w => w.includes(numStr) || numStr.includes(w));
        if (idx >= 0) cleanWords.splice(idx, 1);
    }

    // 4. Remaining words → beneficiary (first noun-chunk) + description
    const remaining = cleanWords.join(' ').trim();
    const parts = remaining.split(/\bpara\b|\bref\b|\bde\b/i);
    const beneficiary = parts[0]?.trim() || '';
    const description = parts[1]?.trim() || remaining;

    return {
        amount: Math.round(amount * 100) / 100,
        beneficiary,
        description: description || beneficiary,
        paymentType,
    };
}
