export type FunctionCategory = "Math & Trig" | "Statistical" | "Logical" | "Text" | "Date & Time" | "Lookup & Reference";

export interface FunctionInfo {
  name: string;
  category: FunctionCategory;
  syntax: string;
  description: string;
  /** Example formula; the e2e suite evaluates each one in the engine. */
  example: string;
  expected: number | string | boolean;
  /** Values the example reads from cells Z1, Z2, … (criteria functions need real ranges). */
  fixture?: number[];
}

/** Functions surfaced in the Formulas ribbon and the fx menu. All verified against the formula engine. */
export const FUNCTION_CATALOG: readonly FunctionInfo[] = [
  { name: "SUM", category: "Math & Trig", syntax: "SUM(number1, [number2], …)", description: "Adds numbers.", example: "=SUM(1,2,3)", expected: 6 },
  { name: "SUMIF", category: "Math & Trig", syntax: "SUMIF(range, criteria, [sum_range])", description: "Adds the cells that meet a condition.", example: '=SUMIF(Z1:Z3,">1")', expected: 5, fixture: [1, 2, 3] },
  { name: "SUMPRODUCT", category: "Math & Trig", syntax: "SUMPRODUCT(array1, [array2], …)", description: "Multiplies matching items and sums the products.", example: "=SUMPRODUCT({1,2},{3,4})", expected: 11 },
  { name: "ROUND", category: "Math & Trig", syntax: "ROUND(number, digits)", description: "Rounds a number to a given number of digits.", example: "=ROUND(3.14159,2)", expected: 3.14 },
  { name: "ABS", category: "Math & Trig", syntax: "ABS(number)", description: "Absolute value of a number.", example: "=ABS(-4)", expected: 4 },
  { name: "INT", category: "Math & Trig", syntax: "INT(number)", description: "Rounds down to the nearest integer.", example: "=INT(7.9)", expected: 7 },
  { name: "MOD", category: "Math & Trig", syntax: "MOD(number, divisor)", description: "Remainder after division.", example: "=MOD(10,3)", expected: 1 },
  { name: "POWER", category: "Math & Trig", syntax: "POWER(number, power)", description: "Raises a number to a power.", example: "=POWER(2,10)", expected: 1024 },
  { name: "SQRT", category: "Math & Trig", syntax: "SQRT(number)", description: "Positive square root.", example: "=SQRT(81)", expected: 9 },
  { name: "PRODUCT", category: "Math & Trig", syntax: "PRODUCT(number1, [number2], …)", description: "Multiplies numbers.", example: "=PRODUCT(2,3,4)", expected: 24 },

  { name: "AVERAGE", category: "Statistical", syntax: "AVERAGE(number1, [number2], …)", description: "Arithmetic mean.", example: "=AVERAGE(2,4,9)", expected: 5 },
  { name: "COUNT", category: "Statistical", syntax: "COUNT(value1, [value2], …)", description: "Counts values that are numbers.", example: '=COUNT(1,"a",3)', expected: 2 },
  { name: "COUNTA", category: "Statistical", syntax: "COUNTA(value1, [value2], …)", description: "Counts non-empty values.", example: '=COUNTA(1,"a",3)', expected: 3 },
  { name: "COUNTIF", category: "Statistical", syntax: "COUNTIF(range, criteria)", description: "Counts cells that meet a condition.", example: '=COUNTIF(Z1:Z3,">4")', expected: 2, fixture: [1, 5, 9] },
  { name: "MAX", category: "Statistical", syntax: "MAX(number1, [number2], …)", description: "Largest value.", example: "=MAX(3,8,1)", expected: 8 },
  { name: "MIN", category: "Statistical", syntax: "MIN(number1, [number2], …)", description: "Smallest value.", example: "=MIN(3,8,1)", expected: 1 },
  { name: "MEDIAN", category: "Statistical", syntax: "MEDIAN(number1, [number2], …)", description: "Middle value.", example: "=MEDIAN(1,3,9)", expected: 3 },

  { name: "IF", category: "Logical", syntax: "IF(test, value_if_true, [value_if_false])", description: "Returns one value if a condition is true and another if false.", example: '=IF(2>1,"yes","no")', expected: "yes" },
  { name: "IFERROR", category: "Logical", syntax: "IFERROR(value, value_if_error)", description: "Returns a fallback when a formula errors.", example: "=IFERROR(1/0,0)", expected: 0 },
  { name: "AND", category: "Logical", syntax: "AND(logical1, [logical2], …)", description: "TRUE if all arguments are TRUE.", example: "=AND(1>0,2>1)", expected: true },
  { name: "OR", category: "Logical", syntax: "OR(logical1, [logical2], …)", description: "TRUE if any argument is TRUE.", example: "=OR(1>2,2>1)", expected: true },
  { name: "NOT", category: "Logical", syntax: "NOT(logical)", description: "Reverses a logical value.", example: "=NOT(1>2)", expected: true },

  { name: "CONCATENATE", category: "Text", syntax: "CONCATENATE(text1, [text2], …)", description: "Joins text items.", example: '=CONCATENATE("Mac","Tuxel")', expected: "MacTuxel" },
  { name: "LEFT", category: "Text", syntax: "LEFT(text, [num_chars])", description: "Leftmost characters.", example: '=LEFT("MacTuxel",3)', expected: "Mac" },
  { name: "RIGHT", category: "Text", syntax: "RIGHT(text, [num_chars])", description: "Rightmost characters.", example: '=RIGHT("MacTuxel",5)', expected: "Tuxel" },
  { name: "MID", category: "Text", syntax: "MID(text, start, num_chars)", description: "Characters from the middle of text.", example: '=MID("MacTuxel",4,2)', expected: "Tu" },
  { name: "LEN", category: "Text", syntax: "LEN(text)", description: "Number of characters.", example: '=LEN("Tuxel")', expected: 5 },
  { name: "UPPER", category: "Text", syntax: "UPPER(text)", description: "Converts to uppercase.", example: '=UPPER("mac")', expected: "MAC" },
  { name: "LOWER", category: "Text", syntax: "LOWER(text)", description: "Converts to lowercase.", example: '=LOWER("MAC")', expected: "mac" },
  { name: "TRIM", category: "Text", syntax: "TRIM(text)", description: "Removes extra spaces.", example: '=TRIM("  a  b ")', expected: "a b" },
  { name: "TEXT", category: "Text", syntax: "TEXT(value, format_text)", description: "Formats a number as text.", example: '=TEXT(0.5,"0%")', expected: "50%" },

  { name: "TODAY", category: "Date & Time", syntax: "TODAY()", description: "Today's date (serial number).", example: "=TODAY()>40000", expected: true },
  { name: "NOW", category: "Date & Time", syntax: "NOW()", description: "Current date and time.", example: "=NOW()>40000", expected: true },
  { name: "DATE", category: "Date & Time", syntax: "DATE(year, month, day)", description: "Builds a date from parts.", example: "=DATE(2026,3,1)-DATE(2026,2,1)", expected: 28 },
  { name: "YEAR", category: "Date & Time", syntax: "YEAR(date)", description: "Year of a date.", example: "=YEAR(DATE(2026,3,14))", expected: 2026 },
  { name: "MONTH", category: "Date & Time", syntax: "MONTH(date)", description: "Month of a date (1–12).", example: "=MONTH(DATE(2026,3,14))", expected: 3 },
  { name: "DAY", category: "Date & Time", syntax: "DAY(date)", description: "Day of the month (1–31).", example: "=DAY(DATE(2026,3,14))", expected: 14 },

  { name: "VLOOKUP", category: "Lookup & Reference", syntax: "VLOOKUP(lookup_value, table, col_index, [exact])", description: "Looks down the first column and returns a value from the same row.", example: '=VLOOKUP(2,{1,"a";2,"b"},2,FALSE)', expected: "b" },
  { name: "HLOOKUP", category: "Lookup & Reference", syntax: "HLOOKUP(lookup_value, table, row_index, [exact])", description: "Looks across the first row and returns a value from the same column.", example: '=HLOOKUP(2,{1,2;"a","b"},2,FALSE)', expected: "b" },
  { name: "INDEX", category: "Lookup & Reference", syntax: "INDEX(array, row, [column])", description: "Value at a position in a range.", example: "=INDEX({10,20,30},1,2)", expected: 20 },
  { name: "MATCH", category: "Lookup & Reference", syntax: "MATCH(lookup_value, array, [match_type])", description: "Position of a value in a range.", example: "=MATCH(30,{10,20,30},0)", expected: 3 },
  { name: "XLOOKUP", category: "Lookup & Reference", syntax: "XLOOKUP(lookup, lookup_array, return_array, …)", description: "Finds a value and returns the matching item.", example: '=XLOOKUP(2,{1,2,3},{"x","y","z"})', expected: "y" },
];

export const FUNCTION_CATEGORIES: readonly FunctionCategory[] = [
  "Math & Trig",
  "Statistical",
  "Logical",
  "Text",
  "Date & Time",
  "Lookup & Reference",
];

export function functionsIn(category: FunctionCategory): FunctionInfo[] {
  return FUNCTION_CATALOG.filter((f) => f.category === category);
}
