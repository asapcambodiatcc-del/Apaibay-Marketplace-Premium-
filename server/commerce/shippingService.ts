export interface ShippingOption {
  id: 'standard' | 'express';
  name: string;
  carrier: string;
  estimatedDelivery: string;
  fee: number;
}

export const CANONICAL_SHIPPING_CONFIG = {
  standard: {
    id: 'standard' as const,
    name: 'Apaibay Standard Delivery',
    carrier: 'FedEx Priority Global',
    estimatedDelivery: '3 - 5 business days',
    baseFee: 9.99,
    freeThreshold: 50.0,
  },
  express: {
    id: 'express' as const,
    name: 'Express Air Priority',
    carrier: 'FedEx Air Express Global',
    estimatedDelivery: '1 - 2 business days',
    baseFee: 14.99,
    freeThreshold: Infinity,
  },
};

export function calculateAuthoritativeShipping(
  option: string = 'standard',
  subtotal: number
): ShippingOption {
  const selectedKey = option.toLowerCase() === 'express' ? 'express' : 'standard';
  const config = CANONICAL_SHIPPING_CONFIG[selectedKey];

  let fee = config.baseFee;
  if (subtotal >= config.freeThreshold || subtotal <= 0) {
    fee = 0;
  }

  return {
    id: config.id,
    name: config.name,
    carrier: config.carrier,
    estimatedDelivery: config.estimatedDelivery,
    fee: parseFloat(fee.toFixed(2)),
  };
}

export function getAllShippingOptions(subtotal: number): ShippingOption[] {
  return [
    calculateAuthoritativeShipping('standard', subtotal),
    calculateAuthoritativeShipping('express', subtotal),
  ];
}
