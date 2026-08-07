import math
import re
import unicodedata


_NUMBER_RE = re.compile(r"[-+]?\d(?:[\d\s.,]*\d)?")
_TRUE_VALUES = {"1", "true", "t", "yes", "y", "si", "sí"}
_FALSE_VALUES = {"0", "false", "f", "no", "n"}


def _extract_number(value) -> str | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return str(value)
    match = _NUMBER_RE.search(str(value).strip())
    return match.group(0) if match else None


def _parse_number(value) -> float | None:
    token = _extract_number(value)
    if token is None:
        return None

    token = token.replace(" ", "")
    sign = -1 if token.startswith("-") else 1
    token = token.lstrip("+-")
    if not token:
        return None

    if "." in token and "," in token:
        decimal_separator = "." if token.rfind(".") > token.rfind(",") else ","
        integer_part, fractional_part = token.rsplit(decimal_separator, 1)
        integer_part = integer_part.replace(".", "").replace(",", "")
        normalized = f"{integer_part}.{fractional_part}"
    elif "," in token:
        parts = token.split(",")
        if len(parts) > 2 or all(len(part) == 3 for part in parts[1:]):
            normalized = "".join(parts)
        else:
            normalized = f"{parts[0]}.{parts[1]}"
    elif token.count(".") > 1:
        normalized = token.replace(".", "")
    else:
        normalized = token

    try:
        result = sign * float(normalized)
    except ValueError:
        return None
    return result if math.isfinite(result) else None


def to_int(value, default=None):
    token = _extract_number(value)
    if token is not None:
        compact = token.replace(" ", "")
        sign = -1 if compact.startswith("-") else 1
        unsigned = compact.lstrip("+-")
        if unsigned.count(".") == 1 and "," not in unsigned:
            left, right = unsigned.split(".")
            if len(right) == 3:
                return sign * int(f"{left}{right}")
        if unsigned.count(",") == 1 and "." not in unsigned:
            left, right = unsigned.split(",")
            if len(right) == 3:
                return sign * int(f"{left}{right}")
    result = _parse_number(value)
    if result is None:
        return default
    try:
        return int(result)
    except (OverflowError, ValueError):
        return default


def to_float(value, default=None):
    result = _parse_number(value)
    return result if result is not None else default


def to_bool(value, default=None):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and math.isfinite(value):
        return bool(value)
    normalized = unicodedata.normalize("NFKD", str(value)).encode(
        "ascii", "ignore"
    ).decode("ascii").strip().lower()
    if normalized in _TRUE_VALUES:
        return True
    if normalized in _FALSE_VALUES:
        return False
    return default


def first_int(text, default=None):
    return to_int(text, default)
