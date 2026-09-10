export function normalizeAwbLookup(value: string) {
  const trimmed = value.trim();
  const labeledValue = stripPrintedAwbLabel(trimmed);
  return [...labeledValue]
    .filter((character) => character.trim() !== "")
    .join("")
    .toUpperCase();
}

function stripPrintedAwbLabel(value: string) {
  if (value.slice(0, 3).toUpperCase() !== "AWB" || !isLabelSeparator(value[3])) return value;

  let remainder = value.slice(3).trimStart();
  if (remainder[0] === ":" || remainder[0] === "#") remainder = remainder.slice(1).trimStart();

  const upperRemainder = remainder.toUpperCase();
  for (const prefix of ["NUMBER", "NO.", "NO"]) {
    if (upperRemainder.startsWith(prefix) && isLabelSeparator(remainder[prefix.length])) {
      remainder = remainder.slice(prefix.length).trimStart();
      if (remainder[0] === ":" || remainder[0] === "#") remainder = remainder.slice(1).trimStart();
      break;
    }
  }

  return remainder || value;
}

function isLabelSeparator(character: string | undefined) {
  return character === ":" || character === "#" || Boolean(character && character.trim() === "");
}
