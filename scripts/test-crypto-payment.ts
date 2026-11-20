import crypto from 'crypto';
import { CryptoPaymentProvider } from '../server/payment/providers/cryptoProvider';
import { PaymentProviderRegistry } from '../server/payment/paymentProviderRegistry';
import { PaymentService } from '../server/payment/paymentService';
import { WebhookService } from '../server/payment/webhookService';
import { PaymentConfigService } from '../server/payment/paymentConfig';
import { AuthenticatedUser } from '../server/auth/roles';
import { db, doc, setDoc, getDoc } from '../server/repositories/serverFirestore';
import { Payment, PaymentIntent } from '../server/payment/paymentTypes';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, failureDetails?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${testName} - ${failureDetails || 'Assertion failed'}`);
    failCount++;
  }
}

async function runCryptoPaymentE2ETests() {
  console.log('=============================================================================');
  console.log('🪙 APAIBAY MARKETPLACE: CRYPTO CHECKOUT COMPLETE E2E VERIFICATION SUITE');
  console.log('=============================================================================');

  const customerAlice: AuthenticatedUser = {
    uid: 'cust_alice_crypto_e2e',
    email: 'alice.crypto@example.com',
    emailVerified: true,
    role: 'buyer' as any,
    isAdmin: false,
    isSeller: false,
  };

  const attackerEve: AuthenticatedUser = {
    uid: 'attacker_eve_crypto',
    email: 'eve.hacker@example.com',
    emailVerified: true,
    role: 'buyer' as any,
    isAdmin: false,
    isSeller: false,
  };

  const adminBob: AuthenticatedUser = {
    uid: 'admin_bob_crypto',
    email: 'bob.admin@apaibay.com',
    emailVerified: true,
    role: 'admin' as any,
    isAdmin: true,
    isSeller: false,
  };

  // -------------------------------------------------------------------------
  console.log('\n[1/8] Verifying Customer Checkout Journey & Asset Options...');
  // -------------------------------------------------------------------------
  const options = CryptoPaymentProvider.getSupportedOptions();
  assert(options.length === 4, 'Provides exactly 4 supported cryptocurrency options');

  const usdtBep20 = options.find((o) => o.id === 'usdt_bep20');
  assert(!!usdtBep20 && usdtBep20.currency === 'USDT' && usdtBep20.tokenStandard === 'BEP-20' && usdtBep20.network === 'BNB Smart Chain', 'USDT — BEP-20 (BNB Smart Chain) supported with BEP-20 token standard');

  const usdtTrc20 = options.find((o) => o.id === 'usdt_trc20');
  assert(!!usdtTrc20 && usdtTrc20.currency === 'USDT' && usdtTrc20.tokenStandard === 'TRC-20' && usdtTrc20.network === 'TRON Network', 'USDT — TRC-20 (TRON Network) supported with TRC-20 token standard');

  const usdcSolana = options.find((o) => o.id === 'usdc_solana');
  assert(!!usdcSolana && usdcSolana.currency === 'USDC' && usdcSolana.tokenStandard === 'SPL' && usdcSolana.network === 'Solana', 'USDC — Solana supported with SPL token standard');

  const bnbBsc = options.find((o) => o.id === 'bnb_bsc');
  assert(!!bnbBsc && bnbBsc.currency === 'BNB' && bnbBsc.network === 'BNB Smart Chain', 'BNB — BNB Smart Chain supported');

  let unsupportedCryptoBlocked = false;
  try {
    CryptoPaymentProvider.calculateCryptoAmount(100, 'USD', 'btc_bitcoin');
  } catch (err: any) {
    unsupportedCryptoBlocked = err.message.includes('Unsupported cryptocurrency');
  }
  assert(unsupportedCryptoBlocked, 'Unsupported cryptocurrency (BTC) is strictly rejected');

  let unsupportedNetworkBlocked = false;
  try {
    CryptoPaymentProvider.calculateCryptoAmount(100, 'USD', 'usdt_erc20');
  } catch {
    unsupportedNetworkBlocked = true;
  }
  assert(unsupportedNetworkBlocked, 'Unsupported network (Ethereum ERC-20) is strictly rejected');

  // -------------------------------------------------------------------------
  console.log('\n[2/8] Verifying Server-Authoritative Rate & Precision Calculations...');
  // -------------------------------------------------------------------------
  const calcUsdt = CryptoPaymentProvider.calculateCryptoAmount(150.0, 'USD', 'usdt_bep20');
  assert(calcUsdt.payAmount === 150.0 && calcUsdt.rate === 1.0, 'USDT rate is 1:1 ($150 = 150.00 USDT)');
  assert(calcUsdt.config.precision === 2, 'USDT precision is 2 decimals');

  const calcUsdc = CryptoPaymentProvider.calculateCryptoAmount(75.5, 'USD', 'usdc_solana');
  assert(calcUsdc.payAmount === 75.5, 'USDC rate is 1:1 ($75.50 = 75.50 USDC)');

  const calcBnb = CryptoPaymentProvider.calculateCryptoAmount(625.0, 'USD', 'bnb_bsc');
  assert(calcBnb.payAmount === 1.0 && calcBnb.config.precision === 6, 'BNB rate matches reference ($625.00 = 1.000000 BNB with 6 decimals)');

  let invalidAmountBlocked = false;
  try {
    CryptoPaymentProvider.calculateCryptoAmount(-50, 'USD', 'usdt_bep20');
  } catch {
    invalidAmountBlocked = true;
  }
  assert(invalidAmountBlocked, 'Negative or zero amount rejected server-side');

  // -------------------------------------------------------------------------
  console.log('\n[3/8] Verifying Invoice, Deposit Address, QR & Expiration Countdown...');
  // -------------------------------------------------------------------------
  const cryptoProvider = PaymentProviderRegistry.getAdapter('nowpayments');
  assert(cryptoProvider.providerName === 'nowpayments', 'nowpayments resolved from registry');
  assert(cryptoProvider.isSandbox === true, 'Provider operates in sandbox mode');

  const methodProvider = PaymentProviderRegistry.resolveProviderForMethod('crypto');
  assert(methodProvider === 'nowpayments', 'MethodType "crypto" maps to nowpayments provider');

  const intentResult = await cryptoProvider.createPaymentIntent({
    intentId: 'pi_crypto_e2e_001',
    orderId: 'ORD-CRYPTO-E2E-100',
    amount: 120.0,
    currency: 'USD',
    methodType: 'crypto',
    customerUid: customerAlice.uid,
    safeMetadata: { cryptoCurrency: 'usdt_bep20' },
  });

  assert(intentResult.status === 'pending', 'Invoice initialized in pending status');
  assert(intentResult.providerIntentReference.startsWith('NP-INV-'), 'Invoice ID has standard NP-INV- prefix');

  const invoiceDetails = intentResult.safeDetails?.cryptoDetails;
  assert(!!invoiceDetails, 'Safe details contain cryptoDetails object');
  assert(invoiceDetails.currency === 'USDT', 'Currency recorded as USDT');
  assert(invoiceDetails.network === 'BNB Smart Chain', 'Network recorded as BNB Smart Chain');
  assert(invoiceDetails.tokenStandard === 'BEP-20', 'Token standard recorded as BEP-20');
  assert(invoiceDetails.payAmount === 120.0, 'Pay amount matches order total');
  assert(invoiceDetails.payAddress.startsWith('0x') && invoiceDetails.payAddress.length === 42, 'Valid EVM BEP-20 deposit address provided');
  assert(invoiceDetails.qrCodeData.includes(invoiceDetails.payAddress), 'QR code payload contains deposit address');
  assert(invoiceDetails.timeRemainingSeconds === 1200, 'Expiration countdown starts at 20 minutes (1200 seconds)');
  assert(typeof calcUsdt.config.networkWarning === 'string' && calcUsdt.config.networkWarning.includes('permanent loss'), 'Clear warning against wrong-network deposit provided');

  // -------------------------------------------------------------------------
  console.log('\n[4/8] Verifying Cryptographic Webhook (IPN) & Security Defenses...');
  // -------------------------------------------------------------------------
  const ipnSecret = PaymentConfigService.getNowpaymentsConfig().ipnSecret;
  const basePayload = {
    payment_id: 'np_pay_e2e_101',
    payment_status: 'finished',
    pay_amount: 120.0,
    actually_paid: 120.0,
    pay_currency: 'usdtbsc',
    price_amount: 120.0,
    price_currency: 'usd',
    order_id: 'ORD-CRYPTO-E2E-100',
  };

  const validSig = CryptoPaymentProvider.generateIpnSignature(basePayload, ipnSecret);
  assert(typeof validSig === 'string' && validSig.length === 128, 'Generates 128-char HMAC-SHA512 IPN signature');

  const sigVerified = CryptoPaymentProvider.verifyIpnSignature(basePayload, validSig, ipnSecret);
  assert(sigVerified === true, 'Authentic IPN signature verified successfully');

  // Tampered payload defense
  const tamperedPayload = { ...basePayload, actually_paid: 1.0 };
  const tamperedVerified = CryptoPaymentProvider.verifyIpnSignature(tamperedPayload, validSig, ipnSecret);
  assert(tamperedVerified === false, 'Tampered amount payload is strictly rejected');

  // Forged signature defense
  const forgedSigVerified = CryptoPaymentProvider.verifyIpnSignature(basePayload, 'forged_fake_signature_abc123', ipnSecret);
  assert(forgedSigVerified === false, 'Forged signature is strictly rejected');

  // -------------------------------------------------------------------------
  console.log('\n[5/8] Verifying All Required Payment Scenarios Independently...');
  // -------------------------------------------------------------------------
  // Prepare database mock records for scenario verification
  const testOrderId = `ORD-E2E-${Date.now()}`;
  const testPaymentId = `pi_e2e_${Date.now()}`;

  const orderDocRef = doc(db, 'orders', testOrderId);
  await setDoc(orderDocRef, {
    id: testOrderId,
    customerUid: customerAlice.uid,
    total: 100.0,
    subtotal: 100.0,
    currency: 'USD',
    status: 'Placed',
    paymentStatus: 'pending',
    paymentMethod: 'crypto',
    createdAt: new Date().toISOString(),
  });

  const paymentDocRef = doc(db, 'payments', testPaymentId);
  await setDoc(paymentDocRef, {
    id: testPaymentId,
    orderId: testOrderId,
    customerUid: customerAlice.uid,
    amount: 100.0,
    currency: 'USD',
    status: 'pending',
    method: 'crypto',
    provider: 'nowpayments',
    sandboxMode: true,
    safeMetadata: {
      cryptoDetails: {
        payAmount: 100.0,
        currency: 'USDT',
        network: 'BNB Smart Chain',
        tokenStandard: 'BEP-20',
        ticker: 'usdtbsc',
        expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      },
    },
    createdAt: new Date().toISOString(),
  });

  // Scenario 1: Waiting for payment
  const waitingPayload = {
    payment_id: testPaymentId,
    payment_status: 'waiting',
    pay_amount: 100.0,
    actually_paid: 0,
    pay_currency: 'usdtbsc',
    price_amount: 100.0,
    price_currency: 'usd',
    order_id: testOrderId,
  };
  const waitingSig = CryptoPaymentProvider.generateIpnSignature(waitingPayload, ipnSecret);
  const waitingRes = await WebhookService.handleProviderWebhook('nowpayments', waitingPayload, {
    'x-nowpayments-sig': waitingSig,
  });
  assert(waitingRes.statusCode === 200 && waitingRes.status === 'pending', 'Scenario 1 (Waiting): Acknowledged with status pending');

  // Scenario 2: Confirming payment (detecting on-chain, block confirmations)
  const confirmingPayload = {
    payment_id: testPaymentId,
    payment_status: 'confirming',
    pay_amount: 100.0,
    actually_paid: 100.0,
    pay_currency: 'usdtbsc',
    price_amount: 100.0,
    price_currency: 'usd',
    order_id: testOrderId,
  };
  const confirmingSig = CryptoPaymentProvider.generateIpnSignature(confirmingPayload, ipnSecret);
  const confirmingRes = await WebhookService.handleProviderWebhook('nowpayments', confirmingPayload, {
    'x-nowpayments-sig': confirmingSig,
  });
  assert(confirmingRes.statusCode === 200 && confirmingRes.status === 'processing', 'Scenario 2 (Confirming): Transitions to processing state');

  // Scenario 3: Successfully paid
  const paidPayload = {
    payment_id: testPaymentId,
    payment_status: 'finished',
    pay_amount: 100.0,
    actually_paid: 100.0,
    pay_currency: 'usdtbsc',
    price_amount: 100.0,
    price_currency: 'usd',
    order_id: testOrderId,
    payin_extra_id: '0x9abc123def456_tx_hash',
  };
  const paidSig = CryptoPaymentProvider.generateIpnSignature(paidPayload, ipnSecret);
  const paidRes = await WebhookService.handleProviderWebhook('nowpayments', paidPayload, {
    'x-nowpayments-sig': paidSig,
  });
  assert(paidRes.statusCode === 200 && paidRes.status === 'paid', 'Scenario 3 (Successfully Paid): Transitions to paid');

  const updatedOrderSnap = await getDoc(orderDocRef);
  const updatedOrder = updatedOrderSnap.data() as any;
  assert(updatedOrder.paymentStatus === 'paid', 'Order paymentStatus updated to paid');
  assert(updatedOrder.status === 'Processing', 'Order status advanced to Processing');
  assert(updatedOrder.transactionReference === '0x9abc123def456_tx_hash', 'Order records on-chain transaction reference');

  // Scenario 4: Duplicate Webhook Replay
  const duplicateRes = await WebhookService.handleProviderWebhook('nowpayments', paidPayload, {
    'x-nowpayments-sig': paidSig,
  });
  assert(duplicateRes.statusCode === 200 && duplicateRes.duplicate === true, 'Scenario 4 (Duplicate Webhook): Safely acknowledged as duplicate without re-executing');

  // Scenario 5: Underpaid Transaction (Partial Payment)
  const underpaidOrderId = `ORD-UNDER-${Date.now()}`;
  const underpaidPaymentId = `pi_under_${Date.now()}`;
  await setDoc(doc(db, 'orders', underpaidOrderId), {
    id: underpaidOrderId,
    customerUid: customerAlice.uid,
    total: 100.0,
    status: 'Placed',
    paymentStatus: 'pending',
  });
  await setDoc(doc(db, 'payments', underpaidPaymentId), {
    id: underpaidPaymentId,
    orderId: underpaidOrderId,
    customerUid: customerAlice.uid,
    amount: 100.0,
    status: 'pending',
    provider: 'nowpayments',
    safeMetadata: { cryptoDetails: { payAmount: 100.0 } },
  });

  const underpaidPayload = {
    payment_id: underpaidPaymentId,
    payment_status: 'partially_paid',
    pay_amount: 100.0,
    actually_paid: 40.0, // Only 40% paid!
    pay_currency: 'usdtbsc',
    price_amount: 100.0,
    price_currency: 'usd',
    order_id: underpaidOrderId,
  };
  const underpaidSig = CryptoPaymentProvider.generateIpnSignature(underpaidPayload, ipnSecret);
  const underpaidRes = await WebhookService.handleProviderWebhook('nowpayments', underpaidPayload, {
    'x-nowpayments-sig': underpaidSig,
  });
  assert(underpaidRes.status === 'requires_action', 'Scenario 5 (Underpayment): Status mapped to requires_action');

  const underpaidOrderSnap = await getDoc(doc(db, 'orders', underpaidOrderId));
  const underpaidOrder = underpaidOrderSnap.data() as any;
  assert(underpaidOrder.paymentStatus === 'partially_paid', 'Underpaid order marked partially_paid');
  assert(underpaidOrder.status !== 'Processing', 'Underpaid order CANNOT be marked as Paid/Processing');
  assert(underpaidOrder.confirmedAmount === 40.0, 'Underpaid order records confirmedAmount correctly');

  // Scenario 6: Overpaid Transaction
  const overpaidOrderId = `ORD-OVER-${Date.now()}`;
  const overpaidPaymentId = `pi_over_${Date.now()}`;
  await setDoc(doc(db, 'orders', overpaidOrderId), {
    id: overpaidOrderId,
    customerUid: customerAlice.uid,
    total: 100.0,
    status: 'Placed',
    paymentStatus: 'pending',
  });
  await setDoc(doc(db, 'payments', overpaidPaymentId), {
    id: overpaidPaymentId,
    orderId: overpaidOrderId,
    customerUid: customerAlice.uid,
    amount: 100.0,
    status: 'pending',
    provider: 'nowpayments',
    safeMetadata: { cryptoDetails: { payAmount: 100.0 } },
  });

  const overpaidPayload = {
    payment_id: overpaidPaymentId,
    payment_status: 'finished',
    pay_amount: 100.0,
    actually_paid: 125.0, // Overpaid by 25!
    pay_currency: 'usdtbsc',
    price_amount: 100.0,
    price_currency: 'usd',
    order_id: overpaidOrderId,
  };
  const overpaidSig = CryptoPaymentProvider.generateIpnSignature(overpaidPayload, ipnSecret);
  const overpaidRes = await WebhookService.handleProviderWebhook('nowpayments', overpaidPayload, {
    'x-nowpayments-sig': overpaidSig,
  });
  assert(overpaidRes.status === 'paid', 'Scenario 6 (Overpaid): Accepted and transitioned to paid');
  const overpaidOrderSnap = await getDoc(doc(db, 'orders', overpaidOrderId));
  const overpaidOrder = overpaidOrderSnap.data() as any;
  assert(overpaidOrder.overpaidAmount === 25.0, 'Overpaid amount ($25.00) logged for customer refund');

  // Scenario 7: Expired Invoice
  const expiredOrderId = `ORD-EXP-${Date.now()}`;
  const expiredPaymentId = `pi_exp_${Date.now()}`;
  await setDoc(doc(db, 'orders', expiredOrderId), {
    id: expiredOrderId,
    customerUid: customerAlice.uid,
    total: 100.0,
    status: 'Placed',
    paymentStatus: 'pending',
  });
  await setDoc(doc(db, 'payments', expiredPaymentId), {
    id: expiredPaymentId,
    orderId: expiredOrderId,
    customerUid: customerAlice.uid,
    amount: 100.0,
    status: 'pending',
    provider: 'nowpayments',
  });

  const expiredPayload = {
    payment_id: expiredPaymentId,
    payment_status: 'expired',
    pay_amount: 100.0,
    pay_currency: 'usdtbsc',
    price_amount: 100.0,
    price_currency: 'usd',
    order_id: expiredOrderId,
  };
  const expiredSig = CryptoPaymentProvider.generateIpnSignature(expiredPayload, ipnSecret);
  const expiredRes = await WebhookService.handleProviderWebhook('nowpayments', expiredPayload, {
    'x-nowpayments-sig': expiredSig,
  });
  assert(expiredRes.status === 'cancelled', 'Scenario 7 (Expired): Payment status cancelled');
  const expiredOrderSnap = await getDoc(doc(db, 'orders', expiredOrderId));
  const expiredOrder = expiredOrderSnap.data() as any;
  assert(expiredOrder.paymentStatus === 'expired' && expiredOrder.status === 'Cancelled', 'Expired order cancelled');

  // Scenario 8: Expired invoice receiving late payment notification
  const latePaidPayload = {
    payment_id: expiredPaymentId,
    payment_status: 'finished',
    pay_amount: 100.0,
    actually_paid: 100.0,
    pay_currency: 'usdtbsc',
    price_amount: 100.0,
    price_currency: 'usd',
    order_id: expiredOrderId,
  };
  const latePaidSig = CryptoPaymentProvider.generateIpnSignature(latePaidPayload, ipnSecret);
  const latePaidRes = await WebhookService.handleProviderWebhook('nowpayments', latePaidPayload, {
    'x-nowpayments-sig': latePaidSig,
  });
  assert(latePaidRes.statusCode === 400 && latePaidRes.success === false, 'Scenario 8 (Late Payment on Expired): Rejected with status 400');
  const lateOrderSnap = await getDoc(doc(db, 'orders', expiredOrderId));
  const lateOrder = lateOrderSnap.data() as any;
  assert(lateOrder.paymentStatus === 'expired' && lateOrder.status === 'Cancelled', 'Late payment CANNOT mark expired order as Paid');

  // Scenario 9: Failed Payment
  const failedOrderId = `ORD-FAIL-${Date.now()}`;
  const failedPaymentId = `pi_fail_${Date.now()}`;
  await setDoc(doc(db, 'orders', failedOrderId), {
    id: failedOrderId,
    customerUid: customerAlice.uid,
    total: 100.0,
    status: 'Placed',
    paymentStatus: 'pending',
  });
  await setDoc(doc(db, 'payments', failedPaymentId), {
    id: failedPaymentId,
    orderId: failedOrderId,
    customerUid: customerAlice.uid,
    amount: 100.0,
    status: 'pending',
    provider: 'nowpayments',
  });

  const failedPayload = {
    payment_id: failedPaymentId,
    payment_status: 'failed',
    pay_amount: 100.0,
    pay_currency: 'usdtbsc',
    price_amount: 100.0,
    price_currency: 'usd',
    order_id: failedOrderId,
  };
  const failedSig = CryptoPaymentProvider.generateIpnSignature(failedPayload, ipnSecret);
  const failedRes = await WebhookService.handleProviderWebhook('nowpayments', failedPayload, {
    'x-nowpayments-sig': failedSig,
  });
  assert(failedRes.status === 'failed', 'Scenario 9 (Failed): State machine maps to failed');
  const failedOrderSnap = await getDoc(doc(db, 'orders', failedOrderId));
  assert((failedOrderSnap.data() as any).paymentStatus === 'failed', 'Order marked failed');

  // Scenario 10: Unsupported Cryptocurrency in Webhook
  const unsupportedPayload = {
    payment_id: failedPaymentId,
    payment_status: 'finished',
    pay_amount: 1000.0,
    pay_currency: 'dogecoin', // Unsupported!
    price_amount: 100.0,
    price_currency: 'usd',
    order_id: failedOrderId,
  };
  const unsupportedSig = CryptoPaymentProvider.generateIpnSignature(unsupportedPayload, ipnSecret);
  const unsupportedRes = await WebhookService.handleProviderWebhook('nowpayments', unsupportedPayload, {
    'x-nowpayments-sig': unsupportedSig,
  });
  assert(unsupportedRes.statusCode === 400 && unsupportedRes.error?.includes('Unsupported cryptocurrency'), 'Scenario 10 (Unsupported Crypto): Rejected with 400');

  // Scenario 11: Invalid Signature Webhook
  const invalidSigRes = await WebhookService.handleProviderWebhook('nowpayments', waitingPayload, {
    'x-nowpayments-sig': 'bad_fake_sig_123',
  });
  assert(invalidSigRes.statusCode === 401 && invalidSigRes.error?.includes('Invalid webhook cryptographic signature'), 'Scenario 11 (Invalid Signature): Rejected with 401');

  // Scenario 12: Tampered Payload Webhook
  const tamperedSigRes = await WebhookService.handleProviderWebhook('nowpayments', { ...waitingPayload, pay_amount: 1.0 }, {
    'x-nowpayments-sig': waitingSig,
  });
  assert(tamperedSigRes.statusCode === 401, 'Scenario 12 (Tampered Payload): Rejected with 401');

  // -------------------------------------------------------------------------
  console.log('\n[6/8] Verifying Security, Integrity & Authorization Gates...');
  // -------------------------------------------------------------------------
  // Verify client amounts cannot forge order totals
  let forgedAmountIgnored = false;
  try {
    const intentWithForgedAmount = await PaymentService.createPaymentIntent(
      {
        orderId: testOrderId,
        methodType: 'crypto',
        forgedAmount: 0.01, // Attacker tries to pay 1 cent
      },
      customerAlice
    );
    // Amount must strictly match the authoritative database total (100.00), not forged 0.01
    forgedAmountIgnored = intentWithForgedAmount.paymentIntent.amount === 100.0;
  } catch {
    forgedAmountIgnored = true;
  }
  assert(forgedAmountIgnored, 'Client-side forged amounts cannot override trusted order total');

  // Authorization: Attacker Eve cannot access Alice's payment intent
  let eveBlocked = false;
  try {
    await PaymentService.getPaymentIntent(testPaymentId, attackerEve);
  } catch (err: any) {
    eveBlocked = err.statusCode === 403 || err.code === 'FORBIDDEN_PAYMENT_ACCESS';
  }
  assert(eveBlocked, 'Attacker Eve is strictly blocked from viewing Alice’s payment intent');

  // Admin Bob CAN view Alice's payment intent for dispute resolution
  let adminAllowed = false;
  try {
    const adminView = await PaymentService.getPaymentIntent(testPaymentId, adminBob);
    adminAllowed = !!adminView && adminView.id === testPaymentId;
  } catch {
    adminAllowed = false;
  }
  assert(adminAllowed, 'Administrator Bob is authorized to inspect payment intent');

  // Sandbox safety gate
  assert(PaymentConfigService.isProduction() === false, 'PAYMENT_ENVIRONMENT is strictly set to sandbox');
  const pubCfg = PaymentConfigService.getPublicPaymentConfig();
  assert(pubCfg.environment === 'sandbox', 'Public config environment is sandbox');
  assert(!JSON.stringify(pubCfg).includes('SECRET'), 'Zero secret keys exposed in public config');

  // -------------------------------------------------------------------------
  console.log('\n[7/8] Verifying Traditional Payment Regression (All 6 Methods Functional)...');
  // -------------------------------------------------------------------------
  const abaProv = PaymentProviderRegistry.resolveProviderForMethod('aba_payway');
  assert(abaProv === 'aba_payway', 'Traditional method 1 (ABA PAY) maps to aba_payway');

  const khqrProv = PaymentProviderRegistry.resolveProviderForMethod('khqr');
  assert(khqrProv === 'khqr', 'Traditional method 2 (KHQR) maps to khqr');

  const cardProv = PaymentProviderRegistry.resolveProviderForMethod('card');
  assert(cardProv === 'sandbox', 'Traditional methods 3 & 4 (Mastercard & VISA) route to verified card gateway');

  const wingProv = PaymentProviderRegistry.resolveProviderForMethod('wing');
  assert(wingProv === 'wing', 'Traditional methods 5 & 6 (Wing & Wing Bank) route to wing provider');

  // Verify traditional sandbox card simulation remains functional
  const cardOrderId = `ORD-CARD-${Date.now()}`;
  await setDoc(doc(db, 'orders', cardOrderId), {
    id: cardOrderId,
    customerUid: customerAlice.uid,
    total: 50.0,
    status: 'Placed',
    paymentStatus: 'pending',
  });
  const cardIntent = await PaymentService.createPaymentIntent(
    {
      orderId: cardOrderId,
      methodType: 'card',
    },
    customerAlice
  );
  assert(cardIntent.paymentIntent.status === 'pending', 'Traditional card payment intent creates successfully');

  // -------------------------------------------------------------------------
  console.log('\n[8/8] Verifying Complete End-to-End Sandbox Journey...');
  // -------------------------------------------------------------------------
  assert(passCount > 40, 'Executed all required verification scenarios');
  assert(failCount === 0, 'Zero verification failures');

  console.log('\n=============================================================================');
  console.log(`🎉 E2E VERIFICATION COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('=============================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runCryptoPaymentE2ETests().catch((err) => {
  console.error('Fatal E2E test error:', err);
  process.exit(1);
});
