import type { FollowupStep, PostPurchaseConfig } from "./contracts";
import { getPostPurchaseConfig } from "./config";
import { civilString, localCivilDate, localTimeToEpoch, shiftCivilDate, type CivilDate } from "../account/calendar";

const weekday = (date: CivilDate) => new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
const observed = (date: CivilDate) => shiftCivilDate(date, weekday(date) === 6 ? -1 : weekday(date) === 0 ? 1 : 0);
function nth(year: number, month: number, dayOfWeek: number, occurrence: number): CivilDate {
  const first = { year, month, day: 1 }; return { year, month, day: 1 + (dayOfWeek - weekday(first) + 7) % 7 + (occurrence - 1) * 7 };
}
export function isPostalBusinessDay(date: CivilDate): boolean {
  if ([0, 6].includes(weekday(date))) return false;
  const year = date.year;
  const lastMay = {year,month:5,day:31};
  const holidays = [observed({year,month:1,day:1}), observed({year:year+1,month:1,day:1}), nth(year,1,1,3), nth(year,2,1,3), shiftCivilDate(lastMay,-((weekday(lastMay)-1+7)%7)), observed({year,month:6,day:19}), observed({year,month:7,day:4}), nth(year,9,1,1), nth(year,10,1,2), observed({year,month:11,day:11}), nth(year,11,4,4), observed({year,month:12,day:25})];
  return !holidays.some(day => civilString(day) === civilString(date));
}
/** anchorAt is evidenced mailing time, or accepted check-in time for that explicit offer anchor. */
export async function schedulePostPurchaseStep(step: FollowupStep, anchorAt: number, now = Date.now(), pinnedConfig?: PostPurchaseConfig): Promise<number> {
  const config = pinnedConfig || await getPostPurchaseConfig();
  const cfg = config.steps[step];
  if (!cfg.enabled || !Number.isFinite(anchorAt) || anchorAt <= 0) throw new Error("A valid timing anchor and enabled step are required.");
  let date = localCivilDate(anchorAt, config.timezone);
  if (step === "check_in" || config.anchor === "mailing_business_days") {
    for (let count = 0; count < cfg.delayDays;) { date = shiftCivilDate(date, 1); if (isPostalBusinessDay(date)) count++; }
  } else date = shiftCivilDate(date, cfg.delayDays);
  const due = localTimeToEpoch(date, config.sendHourLocal, config.timezone);
  // Preserve past-due evidence: the dispatcher must hold stale work for review, not silently send now.
  return due;
}
export function nextStepFor(step: FollowupStep): FollowupStep | null { return step === "check_in" ? "offer" : null; }
