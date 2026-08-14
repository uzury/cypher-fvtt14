const C2_STAT_POOLS = new Set(["Might", "Speed", "Intellect"]);

export function getNatural20CostTransition({
  teen = false,
  pool = "Pool",
  rollTotal = 0,
  costPaid = 0,
  wasRefunded = false,
  reroll = false
} = {}) {
  const amount = Math.max(0, Number(costPaid) || 0);
  const eligible = !teen && C2_STAT_POOLS.has(pool) && amount > 0;
  const isNatural20 = Number(rollTotal) === 20;

  if (!eligible) {
    return {
      eligible: false,
      isNatural20,
      poolDelta: 0,
      refunded: false,
      refundAmount: 0,
      finalCost: amount
    };
  }

  let refunded = Boolean(wasRefunded);
  let poolDelta = 0;

  if (isNatural20 && !refunded) {
    poolDelta = amount;
    refunded = true;
  } else if (reroll && !isNatural20 && refunded) {
    poolDelta = -amount;
    refunded = false;
  }

  return {
    eligible: true,
    isNatural20,
    poolDelta,
    refunded,
    refundAmount: refunded ? amount : 0,
    finalCost: refunded ? 0 : amount
  };
}
