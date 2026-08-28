// Registro simples do nó DOM que serve de "teto" para os menus suspensos
// (BottomSheet). Evita que um Modal/overlay absolute fique preso a um
// container pequeno no meio do formulário — ele sempre sobe até aqui,
// que é a tela inteira do app (dentro da moldura, no web).
let portalNode = null;

export function setPortalNode(node) {
    portalNode = node;
}

export function getPortalNode() {
    return portalNode;
}
