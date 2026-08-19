/**
 * Fixtures de payloads CRUS da Pluggy (`Account`/`Transaction`), no formato
 * REAL da SDK (node_modules/pluggy-sdk/dist/types/account.d.ts e
 * transaction.d.ts) - confirmado contra a sondagem real da API descrita em
 * docs/PREMISSA.md secao 11 (Item real, 2026-07-25: 3 contas - 1 corrente +
 * 2 cartoes -, 432 transacoes).
 *
 * REGRA DESTA TASK (a mais sensivel a "teste que passa contra ficcao" ate
 * agora): os shapes aqui seguem a secao 11 da PREMISSA, NAO a documentacao
 * antiga da Pluggy. Foi um mock fiel a doc (e infiel a API real) que
 * escondeu o bug do 404 na TASK-005 - ver docs/PREMISSA.md secao 11 e
 * DEBITO-TECNICO.md DT-008/DT-017.
 *
 * Cada builder devolve o payload COMPLETO documentado pelo SDK (todos os
 * campos, incluindo PII/dados sensiveis) para que os testes de "so persiste
 * X" tenham PODER DE DETECCAO real contra vazamento - a mesma tecnica de
 * `buildMockPluggyItemResponse` em tests/unit/lib/pluggy.test.ts (licao do
 * DT-011: uma asserção de nao-vazamento so vale alguma coisa se o payload
 * testado pudesse conter o valor proibido).
 */

let uniqueCounter = 0;
function uniqueSuffix(): string {
  uniqueCounter += 1;
  return `${Date.now()}-${uniqueCounter}`;
}

/** CPF fabricado para teste - formato valido, NUNCA um documento real. */
export const FAKE_PAYER_CPF = "123.456.789-00";
/** CNPJ fabricado para teste - formato valido, NUNCA um documento real. */
export const FAKE_RECEIVER_CNPJ = "12.345.678/0001-95";
/** CPF fabricado para teste, usado como `account.taxNumber` (titular). */
export const FAKE_ACCOUNT_HOLDER_CPF = "987.654.321-00";

/**
 * Payload completo de `Account` (node_modules/pluggy-sdk/dist/types/account.d.ts).
 * Default: conta corrente (`BANK`/`CHECKING_ACCOUNT`), sem `creditData`.
 */
export function buildMockPluggyAccountResponse(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `pluggy-account-${uniqueSuffix()}`,
    itemId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    type: "BANK",
    subtype: "CHECKING_ACCOUNT",
    number: "0001/12345-6",
    balance: 5230.11,
    name: "Banco Teste Conta Corrente",
    marketingName: "Conta Corrente Premium",
    owner: "Fulano de Tal",
    // PII real confirmada na sondagem (secao 11 da PREMISSA) - NUNCA deve
    // ser persistida em nenhuma coluna.
    taxNumber: FAKE_ACCOUNT_HOLDER_CPF,
    currencyCode: "BRL",
    bankData: {
      transferNumber: "0001/12345-6",
      closingBalance: 5230.11,
      automaticallyInvestedBalance: 0,
      overdraftContractedLimit: 1000,
      overdraftUsedLimit: 0,
      unarrangedOverdraftAmount: 0,
      hasReservedBalance: false,
      reservedBalances: null,
    },
    creditData: null,
    ...overrides,
  };
}

/**
 * Payload completo de `Account` do tipo cartao de credito (`CREDIT`/
 * `CREDIT_CARD`), com `creditData` preenchido conforme a sondagem real
 * (secao 11 da PREMISSA - `creditData` e mais rico que a doc antiga).
 */
export function buildMockPluggyCreditCardAccountResponse(
  overrides: Record<string, unknown> = {},
) {
  return buildMockPluggyAccountResponse({
    type: "CREDIT",
    subtype: "CREDIT_CARD",
    number: "**** **** **** 1234",
    balance: -820.45,
    name: "Banco Teste Cartao",
    marketingName: "Cartao Black",
    bankData: null,
    creditData: {
      level: "BLACK",
      brand: "MASTERCARD",
      balanceCloseDate: new Date("2026-07-28T00:00:00.000Z"),
      balanceDueDate: new Date("2026-08-10T00:00:00.000Z"),
      availableCreditLimit: 9179.55,
      balanceForeignCurrency: null,
      minimumPayment: 164.09,
      creditLimit: 10000,
      isLimitFlexible: false,
      status: "ACTIVE",
      holderType: "MAIN",
      disaggregatedCreditLimits: [
        {
          creditLineLimitType: "LIMITE_CREDITO_TOTAL",
          consolidationType: "CONSOLIDADO",
          identificationNumber: "1",
          isLimitFlexible: false,
          usedAmount: 820.45,
          usedAmountCurrencyCode: "BRL",
        },
      ],
    },
    ...overrides,
  });
}

/**
 * Payload completo de `Transaction` (node_modules/pluggy-sdk/dist/types/transaction.d.ts).
 * Default: transacao de conta corrente, saida (`DEBIT`, amount negativo) -
 * bate com o nosso modelo sem normalizacao (caso "facil").
 */
export function buildMockPluggyTransactionResponse(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `pluggy-tx-${uniqueSuffix()}`,
    accountId: "pluggy-account-default",
    date: new Date("2026-07-20T12:00:00.000Z"),
    description: "Pagamento de boleto",
    descriptionRaw: "PAGTO BOLETO 20/07",
    type: "DEBIT",
    // Conta corrente: DEBIT vem com amount NEGATIVO (confirmado real,
    // secao 11 da PREMISSA - "-1806.01").
    amount: -1806.01,
    amountInAccountCurrency: -1806.01,
    balance: 3424.1,
    currencyCode: "BRL",
    category: null,
    status: "POSTED",
    providerCode: "0700",
    paymentData: undefined,
    creditCardMetadata: null,
    merchant: undefined,
    categoryId: null,
    operationType: "TED",
    operationTypeAdditionalInfo: null,
    providerId: null,
    createdAt: new Date("2026-07-20T12:05:00.000Z"),
    updatedAt: new Date("2026-07-20T12:05:00.000Z"),
    ...overrides,
  };
}

/**
 * O CORACAO da task (DT-007): transacao de CARTAO, uma compra. `type=DEBIT`
 * como na conta corrente, mas `amount` vem POSITIVO (confirmado real,
 * secao 11 da PREMISSA - "+138.83", `category="Online shopping"`). Se o
 * sync nao normalizar pelo TIPO DA CONTA (nao pelo `type` da transacao,
 * que e o mesmo DEBIT dos dois casos), essa compra vira receita.
 */
export function buildRealCreditCardPurchaseTransaction(
  overrides: Record<string, unknown> = {},
) {
  return buildMockPluggyTransactionResponse({
    type: "DEBIT",
    amount: 138.83,
    amountInAccountCurrency: 138.83,
    description: "Compra online - Loja Teste",
    descriptionRaw: "COMPRA ONLINE LOJA TESTE",
    category: "Online shopping",
    categoryId: "08010000",
    operationType: null,
    creditCardMetadata: {
      installmentNumber: 1,
      totalInstallments: 1,
      totalAmount: 138.83,
      payeeMCC: 5411,
      purchaseDate: new Date("2026-07-19T18:32:00.000Z"),
      billId: "bill-2026-08",
      cardNumber: "1234",
      billForecastDate: "2026-08",
    },
    ...overrides,
  });
}

/**
 * Pagamento de fatura no cartao - `amount` NEGATIVO na Pluggy (a doc:
 * "positive for credit card expenses, negative for payments"). Depois da
 * normalizacao pela regra de conta CREDIT (inversao), fica POSITIVO no
 * nosso modelo - convencao consistente com a inversao unica por tipo de
 * conta (nao condicional ao `type` da transacao).
 */
export function buildRealCreditCardPaymentTransaction(
  overrides: Record<string, unknown> = {},
) {
  return buildMockPluggyTransactionResponse({
    type: "CREDIT",
    amount: -500,
    amountInAccountCurrency: -500,
    description: "Pagamento de fatura",
    descriptionRaw: "PGTO FATURA CARTAO",
    category: null,
    categoryId: null,
    creditCardMetadata: null,
    ...overrides,
  });
}

/**
 * Transacao com `paymentData` completo, incluindo PII real (CPF do
 * pagador, CNPJ do recebedor, nomes e dados de conta) - o achado central do
 * DT-017 (secao 11 da PREMISSA, item 3). O sync deve extrair SOMENTE
 * `paymentData.paymentMethod` e descartar todo o resto.
 */
export function buildTransactionWithPaymentData(
  overrides: Record<string, unknown> = {},
) {
  return buildMockPluggyTransactionResponse({
    type: "DEBIT",
    amount: -250,
    description: "Pix enviado",
    descriptionRaw: "PIX ENVIADO",
    operationType: "PIX",
    paymentData: {
      payer: {
        documentNumber: { type: "CPF", value: FAKE_PAYER_CPF },
        name: "Fulano de Tal Pagador",
        accountNumber: "12345-6",
        branchNumber: "0001",
        routingNumber: "001",
        routingNumberISPB: "00000000",
      },
      receiver: {
        documentNumber: { type: "CNPJ", value: FAKE_RECEIVER_CNPJ },
        name: "Loja Teste Recebedora LTDA",
        accountNumber: "98765-4",
        branchNumber: "0002",
        routingNumber: "237",
        routingNumberISPB: "00000208",
      },
      receiverReferenceId: "ref-12345",
      paymentMethod: "PIX",
      referenceNumber: "PIX",
      reason: "Pagamento de servico",
      boletoMetadata: null,
    },
    ...overrides,
  });
}

export const ALL_TABLES_PII_SUBSTRINGS = [
  FAKE_PAYER_CPF,
  FAKE_RECEIVER_CNPJ,
  FAKE_ACCOUNT_HOLDER_CPF,
];

/**
 * TASK-008 (DT-019) - valores SHA-256 de referencia, calculados de forma
 * INDEPENDENTE de `hashDocument` (via `node:crypto` direto neste arquivo de
 * fixture, na propria maquina do qa - nao reimportando a funcao de
 * producao), para os testes de `hashDocument`/`fetchPluggyAllTransactions`
 * terem poder de deteccao real contra uma implementacao que use outro
 * algoritmo, um salt, ou normalize errado (licao do DT-011 - comparar
 * `hashDocument(x)` consigo mesma so prova consistencia interna, nunca prova
 * que o algoritmo e SHA-256 de verdade). `KNOWN_SHA256_HEX_CPF` e o SHA-256
 * hex de "12345678900" (FAKE_PAYER_CPF so com digitos);
 * `KNOWN_SHA256_HEX_CNPJ` e o SHA-256 hex de "12345678000195"
 * (FAKE_RECEIVER_CNPJ so com digitos) - conferido via
 * `printf '%s' "12345678900" | shasum -a 256` e
 * `node -e "console.log(require('node:crypto').createHash('sha256').update('12345678900').digest('hex'))"`.
 */
export const KNOWN_SHA256_HEX_CPF =
  "a8476735b37a541a38402a2e7037c79e2d217fe9780e5e34347156ef61eff42b";
export const KNOWN_SHA256_HEX_CNPJ =
  "ae9351af0d397d503ea2ec21addc17e364b940411cfa37d8e8874c06b550a40b";

/**
 * TASK-011 (Fatura do cartao, fecha a Fase 5) - payload completo de
 * `CreditCardBills` (node_modules/pluggy-sdk/dist/types/creditCardBills.d.ts),
 * confirmado contra a sondagem real (docs/PREMISSA.md secao 11, 2026-08-19):
 * um cartao real tinha 13 faturas; a mais recente vencia 10/08, total
 * R$3.408,84, minimo R$511,32 - os mesmos valores usados aqui como default.
 *
 * MESMA REGRA da secao 11/DT-011 (as fixtures desta task sao as mais
 * sensiveis a "mock fiel a doc, infiel a API real" desde o 404 da TASK-005):
 * o payload inclui `payments`/`financeCharges` PREENCHIDOS (nao so `[]`),
 * para que os testes de "so persiste id/dueDate/totalAmount/
 * minimumPaymentAmount" tenham poder de deteccao real contra QUALQUER um
 * desses campos vazando (a mesma tecnica de
 * `buildMockPluggyItemResponse`/`buildMockPluggyAccountResponse` acima).
 */
export function buildMockPluggyCreditCardBillResponse(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `pluggy-bill-${uniqueSuffix()}`,
    dueDate: new Date("2026-08-10T00:00:00.000Z"),
    totalAmount: 3408.84,
    totalAmountCurrencyCode: "BRL",
    minimumPaymentAmount: 511.32,
    allowsInstallments: true,
    financeCharges: [
      {
        id: "finance-charge-1",
        type: "LATE_PAYMENT_INTEREST",
        amount: 12.5,
        currencyCode: "BRL",
        additionalInfo: null,
      },
    ],
    payments: [
      {
        id: "payment-1",
        valueType: "FULL_PAYMENT",
        paymentDate: new Date("2026-07-09T00:00:00.000Z"),
        paymentMode: "PIX",
        amount: 3200.0,
        currencyCode: "BRL",
      },
    ],
    createdAt: new Date("2026-07-11T00:00:00.000Z"),
    updatedAt: new Date("2026-07-11T00:00:00.000Z"),
    ...overrides,
  };
}

/**
 * Fatura sem minimo definido - `minimumPaymentAmount: null` (o tipo real da
 * SDK e `number | null`, secao 11 da PREMISSA). Cenario de borda explicito
 * do prompt desta task ("minimumPaymentAmount nullable").
 */
export function buildMockPluggyCreditCardBillWithoutMinimum(
  overrides: Record<string, unknown> = {},
) {
  return buildMockPluggyCreditCardBillResponse({
    minimumPaymentAmount: null,
    ...overrides,
  });
}
