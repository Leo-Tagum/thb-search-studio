// The "Content March" rules of Juan's voice SOP that the article checks enforce in code (Leo, 2026-10-14). Pure patterns, no imports, so the article check, the brief check and the tests share one definition.

/** An opening that sells instead of starting from the seller's problem: a call to action, a cash-offer line, or "we buy" language in the opening of the first section (answer capsule and first paragraph). */
export const PITCH_OPENING = /\b(contact us|call us|call now|call today|reach out to us|get (?:a|your) (?:fair |free |fast |cash |no-obligation )*offer|(?:we|twin home buyer) (?:buys?|pays?|will buy|can buy|buy houses|buy homes)|we(?:'ll| will) (?:buy|pay|make)|sell (?:your (?:house|home) )?(?:fast|quickly|now|today)|(?:fast|quick|instant) cash|cash offer|free (?:no-obligation )?(?:offer|quote|consultation|estimate)|no[- ]obligation|let us (?:buy|help you sell))\b/i;

/** A real-world warning has to name what can delay, block or ruin the sale. */
export const SALE_RISK = /\b(delay\w*|block\w*|stall\w*|stop(?:s|ped|ping)?|halt\w*|derail\w*|fall(?:s|ing)? (?:through|apart)|kill(?:s|ed|ing)?|ruin\w*|hold(?:s|ing)? up|held up|(?:can(?:'t|not)|won't|will not|may not|might not|could not|couldn't) (?:close|clear|sell|proceed|go through)|cancel\w*|prevent\w*|slow(?:s|ed|ing)? (?:down )?(?:the )?(?:sale|escrow|closing|process)|jeopardi\w*)\b/i;

/** The professional-confirmation section must name at least one of these. A city, a county or an insurance professional may be added, but never stand alone. */
export const PRO_REQUIRED = /\b(attorneys?|lawyers?|title compan(?:y|ies)|cpas?|tax (?:professionals?|advis[eo]rs?|preparers?))\b/i;
