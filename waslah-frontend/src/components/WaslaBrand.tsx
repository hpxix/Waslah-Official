type BrandVariant = "arabic" | "english" | "symbol" | "horizontal";

type WaslaBrandProps = {
  className?: string;
  inverse?: boolean;
  variant?: BrandVariant;
};

const symbolPath = "M 52 35 L 50 40 L 50 73 L 56 80 L 58 81 L 116 81 L 122 76 L 124 71 L 124 40 L 122 35 L 117 31 L 114 30 L 94 30 L 93 31 L 93 39 L 94 40 L 112 40 L 114 42 L 114 70 L 112 72 L 62 72 L 60 70 L 60 42 L 62 40 L 66 40 L 67 39 L 66 38 L 66 30 L 60 30 Z M 11 17 L 10 21 L 10 26 L 11 27 L 11 35 L 10 36 L 11 55 L 17 61 L 21 62 L 41 62 L 42 61 L 42 52 L 22 52 L 20 49 L 20 22 L 24 19 L 27 20 L 66 20 L 67 19 L 71 19 L 75 22 L 75 50 L 73 52 L 68 52 L 68 61 L 69 62 L 77 61 L 81 59 L 84 55 L 85 52 L 85 19 L 82 14 L 78 11 L 75 10 L 20 10 L 14 13 Z";

const arabicPath = "M 409 73 L 408 74 L 408 166 L 409 167 L 460 167 L 461 168 L 461 189 L 460 190 L 409 190 L 408 191 L 408 210 L 487 210 L 487 73 Z M 436 100 L 460 100 L 461 101 L 461 139 L 460 140 L 436 140 L 435 139 L 435 101 Z M 69 13 L 69 42 L 98 42 L 98 13 Z M 30 13 L 30 42 L 59 42 L 59 13 Z M 12 73 L 12 167 L 384 167 L 384 73 L 262 73 L 262 139 L 261 140 L 221 140 L 220 139 L 220 12 L 192 12 L 192 139 L 191 140 L 117 140 L 116 139 L 116 73 Z M 289 101 L 290 100 L 356 100 L 357 101 L 357 139 L 356 140 L 290 140 L 289 139 Z M 38 101 L 39 100 L 88 100 L 90 102 L 90 138 L 88 140 L 39 140 L 38 139 Z";

const englishPath = "M 247 10 L 245 12 L 245 14 L 228 52 L 236 52 L 250 20 L 255 29 L 264 52 L 272 52 L 254 10 Z M 188 10 L 187 11 L 187 52 L 218 52 L 218 46 L 196 46 L 194 44 L 194 34 L 195 33 L 194 13 L 195 11 L 194 10 Z M 141 12 L 136 18 L 136 26 L 138 30 L 145 34 L 162 35 L 165 38 L 165 42 L 160 46 L 137 46 L 137 52 L 164 52 L 168 50 L 172 45 L 172 36 L 167 30 L 162 28 L 149 28 L 146 27 L 144 25 L 143 21 L 146 17 L 170 17 L 170 11 L 169 10 L 147 10 Z M 99 10 L 96 14 L 96 16 L 92 23 L 90 30 L 80 52 L 88 52 L 102 20 L 108 32 L 115 51 L 116 52 L 124 52 L 107 12 L 105 10 Z M 10 11 L 25 52 L 32 52 L 33 51 L 43 23 L 46 28 L 54 52 L 62 52 L 68 33 L 73 22 L 76 10 L 70 10 L 68 12 L 67 17 L 58 39 L 55 34 L 49 14 L 47 11 L 42 11 L 39 13 L 34 25 L 31 36 L 29 39 L 26 34 L 18 10 L 11 10 Z";

function SymbolMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="10 10 114 71" role="img" aria-label="رمز وصلة" shapeRendering="geometricPrecision">
      <path d={symbolPath} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

function ArabicMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="12 12 475 198" role="img" aria-label="وصلة" shapeRendering="geometricPrecision">
      <path d={arabicPath} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

function EnglishMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="10 10 262 42" role="img" aria-label="WASLA" shapeRendering="geometricPrecision">
      <path d={englishPath} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

export function WaslaBrand({ className = "", inverse = false, variant = "horizontal" }: WaslaBrandProps) {
  const classes = `wasla-brand wasla-brand--${variant}${inverse ? " is-inverse" : ""} ${className}`.trim();

  if (variant === "symbol") return <SymbolMark className={classes} />;
  if (variant === "arabic") return <ArabicMark className={classes} />;
  if (variant === "english") return <EnglishMark className={classes} />;

  return (
    <span className={classes} aria-label="وصلة">
      <SymbolMark className="wasla-brand__symbol" />
      <span className="wasla-brand__rule" />
      <ArabicMark className="wasla-brand__arabic" />
    </span>
  );
}

