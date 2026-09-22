const STRATEGIES = new Set(["split_difference", "hold_firm", "concede_once"]);

export function negotiateDiscount(rule, requestedDiscount) {
  const minDiscount = Number(rule?.min_discount_percent);
  const maxDiscount = Number(rule?.max_discount_percent);
  const strategy = rule?.counter_strategy;
  const request = Number(requestedDiscount);

  if (
    !Number.isFinite(minDiscount) ||
    !Number.isFinite(maxDiscount) ||
    !Number.isFinite(request) ||
    minDiscount < 0 ||
    maxDiscount > 100 ||
    minDiscount > maxDiscount ||
    request < 0 ||
    request > 100 ||
    !STRATEGIES.has(strategy)
  ) {
    throw new TypeError("Invalid negotiation parameters");
  }

  if (request <= minDiscount) {
    return {
      status: "accepted",
      message: "That's a fair price! We accept your offer.",
      finalDiscount: request,
    };
  }

  if (request > maxDiscount) {
    return {
      status: "rejected",
      message: `I'm sorry, we can't go that low. Our best possible discount is ${maxDiscount}%.`,
      bestOffer: maxDiscount,
    };
  }

  let counterOffer = request;
  if (strategy === "split_difference" || strategy === "concede_once") {
    counterOffer = (minDiscount + request) / 2;
  } else if (strategy === "hold_firm") {
    counterOffer = minDiscount;
  }

  const roundedOffer = Number(counterOffer.toFixed(1));
  return {
    status: "countered",
    message: `How about we meet in the middle? I can offer you a ${roundedOffer}% discount.`,
    counterOffer: roundedOffer,
  };
}
