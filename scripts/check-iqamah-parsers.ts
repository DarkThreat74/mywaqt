// Parser self-check for src/lib/masjid/iqamah.ts — run: pnpm exec tsx scripts/check-iqamah-parsers.ts
import { parseMasjidal, parseMohidHtml, parseMawaqitConfData, parseGenericIqamah, hhmmTo24 } from "../src/lib/masjid/iqamah";

let fails = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (!cond) { fails++; console.error(`FAIL ${name}`, extra ?? ""); }
  else console.log(`ok   ${name}`);
}

check("hhmmTo24 am/pm", hhmmTo24("5:30 am") === "05:30" && hhmmTo24("1:45 PM") === "13:45" && hhmmTo24("12:15 pm") === "12:15" && hhmmTo24("12:05 am") === "00:05");
check("hhmmTo24 rejects junk", hhmmTo24("25:99") === null && hhmmTo24("abc") === null);

const masjidal = parseMasjidal({ data: { iqama: { fajr: "5:30 AM", zuhr: "1:45 PM", asr: "5:00 PM", maghrib: "7:12 PM", isha: "8:30 PM", jummah1: "1:00 PM" } } });
check("masjidal fixed", masjidal?.fixed.join() === "05:30,13:45,17:00,19:12,20:30", masjidal);
check("masjidal jummah", masjidal?.jummah[0] === "13:00", masjidal);
check("masjidal empty", parseMasjidal({ data: {} }) === null);

const mohid = parseMohidHtml(`<div class="x"><div class="prayer_iqama_div">Iqamah</div><div class="prayer_iqama_div">6:00 AM</div><div class="prayer_iqama_div">2:00 PM</div><div class="prayer_iqama_div">5:30 PM</div><div class="prayer_iqama_div">7:45 PM</div><div class="prayer_iqama_div">9:00 PM</div></div><div id="jummah"><span>1:30 PM</span></div>`);
check("mohid fixed+jummah", mohid?.fixed.join() === "06:00,14:00,17:30,19:45,21:00" && mohid?.jummah[0] === "13:30", mohid);

const mawaqit = parseMawaqitConfData(`var confData = {"iqamaCalendar":[{},{},{},{},{},{},{},{},{"15":["+15","1:30","+30","5:30","+20"]}], "jumua":"13:00"};`);
const mOk = mawaqit && (mawaqit.offsets.some((o) => o != null) || mawaqit.fixed.some(Boolean) || mawaqit.jummah.length > 0);
check("mawaqit confData", !!mOk && mawaqit.jummah[0] === "13:00", mawaqit);

const generic = parseGenericIqamah(`<table><tr><td>Fajr</td><td>5:15 AM</td><td>6:00 AM</td></tr><tr><td>Dhuhr</td><td>12:30 PM</td><td>1:15 PM</td></tr><tr><td>Asr</td><td>4:00 PM</td><td>5:00 PM</td></tr><tr><td>Maghrib</td><td>6:30 PM</td><td>6:35 PM</td></tr><tr><td>Isha</td><td>7:45 PM</td><td>8:00 PM</td></tr></table>`);
check("generic html picks LAST time (iqamah col)", generic?.fixed.join() === "06:00,13:15,17:00,18:35,20:00", generic);
check("generic rejects sparse", parseGenericIqamah(`<p>Fajr 5:15 am 6:00 am</p>`) === null);

const csv = parseGenericIqamah(`month,day,fajr,dhuhr,asr,maghrib,isha,jummah\n${["january","february","march","april","may","june","july","august","september","october","november","december"][new Date().getUTCMonth()]},1,6:00 AM,1:15 PM,5:00 PM,7:30 PM,9:00 PM,1:30 PM`);
check("csv row", csv?.fixed.join() === "06:00,13:15,17:00,19:30,21:00", csv);

if (fails) { console.error(`\n${fails} check(s) failed`); process.exit(1); }
console.log("\nAll parser checks passed.");
