const UZBEK_COUNTRY_CODE = '998';
const UZBEK_LOCAL_DIGIT_COUNT = 9;

const localDigits = (value: string): string => {
  const digits = value.replace(/\D/g, '');

  if (digits.startsWith(UZBEK_COUNTRY_CODE)) {
    return digits.slice(UZBEK_COUNTRY_CODE.length, UZBEK_COUNTRY_CODE.length + UZBEK_LOCAL_DIGIT_COUNT);
  }

  // Let people paste or type the familiar local form, 90 123 45 67 or
  // 090 123 45 67, while keeping the account identifier in E.164 form.
  const withoutTrunkPrefix = digits.startsWith('0') ? digits.slice(1) : digits;
  return withoutTrunkPrefix.slice(0, UZBEK_LOCAL_DIGIT_COUNT);
};

export const normalizeUzbekPhone = (value: string): string =>
  `+${UZBEK_COUNTRY_CODE}${localDigits(value)}`;

export const formatUzbekPhoneInput = (value: string): string => {
  const local = localDigits(value);
  const groups = [
    local.slice(0, 2),
    local.slice(2, 5),
    local.slice(5, 7),
    local.slice(7, 9),
  ].filter(Boolean);

  return [`+${UZBEK_COUNTRY_CODE}`, ...groups].join(' ');
};

export const isCompleteUzbekPhone = (value: string): boolean =>
  localDigits(value).length === UZBEK_LOCAL_DIGIT_COUNT;
