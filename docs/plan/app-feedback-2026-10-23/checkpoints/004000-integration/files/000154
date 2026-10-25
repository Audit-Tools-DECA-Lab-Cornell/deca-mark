export function numericInput(text: string, decimal = false): number | undefined {
	if (text.trim() === "") return undefined;
	const pattern = decimal ? /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/ : /^-?\d+$/;
	const value = Number(text);
	return pattern.test(text) && (decimal ? Number.isFinite(value) : Number.isSafeInteger(value)) ? value : Number.NaN;
}
