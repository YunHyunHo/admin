const KOREA_TIME_ZONE = "Asia/Seoul";

type DateInput = Date | string | null | undefined;

type ZonedParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

function toDate(value: DateInput) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function getKoreanDateParts(value: DateInput): ZonedParts | null {
  const date = toDate(value);

  if (!date) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const valueMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: valueMap.year ?? "0000",
    month: valueMap.month ?? "00",
    day: valueMap.day ?? "00",
    hour: valueMap.hour ?? "00",
    minute: valueMap.minute ?? "00",
    second: valueMap.second ?? "00",
  };
}

export function formatKoreanDateTime(
  value: DateInput,
  options: {
    includeYear?: boolean;
    emptyValue?: string;
  } = {},
) {
  if (!value) {
    return options.emptyValue ?? "-";
  }

  const parts = getKoreanDateParts(value);

  if (!parts) {
    return String(value);
  }

  const prefix = options.includeYear
    ? `${parts.year}-${parts.month}-${parts.day}`
    : `${parts.month}-${parts.day}`;

  return `${prefix} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function getKoreanNowStamp(options: { includeYear?: boolean } = {}) {
  return formatKoreanDateTime(new Date(), {
    includeYear: options.includeYear,
    emptyValue: options.includeYear ? "0000-00-00 00:00:00" : "00-00 00:00:00",
  });
}

export function getKoreanIsoDate(value: DateInput = new Date()) {
  const parts = getKoreanDateParts(value);

  if (!parts) {
    return "0000-00-00";
  }

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getKoreanRelativeIsoDate(daysOffset: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysOffset);

  return getKoreanIsoDate(date);
}

export { KOREA_TIME_ZONE };
