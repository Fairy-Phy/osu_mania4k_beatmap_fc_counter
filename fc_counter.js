const request = require("request-promise");
const fs = require("fs").promises;
const XLSX = require("xlsx");
const apitoken = require("./config.json").apitoken;
let start_date = new Date();
const string_start_date = save => save ? `${start_date.getFullYear()}-${start_date.getMonth() + 1}-${start_date.getDate()}` : `${start_date.getFullYear()}-${start_date.getMonth() + 1}-${start_date.getDate()} ${start_date.getHours()}:${start_date.getMinutes()}:${start_date.getSeconds()}`;

const Sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const GetReq = async url => {
	while (true) {
		let errored = false;
		const result = await request(url).catch(async error => {
			if (error.statusCode == 429) {
				console.log("Too Many Request:");
				console.log(error.message);
				await Sleep(1000);
				errored = true;
			}
			else if (error.name == "RequestError") {
				console.log("RequestError");
				console.log(error.message);
				errored = true;
			}
			else {
				console.log("OtherError: ");
				console.log(error.message);
				errored = true;
			}
		});
		if (errored) continue;

		return result;
	}
};

const GetBeatmapID = async beatmapsetid => {
	const request_res = await GetReq(`https://osu.ppy.sh/api/get_beatmaps?k=${apitoken}&m=3&s=${beatmapsetid}`);
	const res_json = JSON.parse(request_res);
	if (res_json.length == 0) throw new Error("Not Found This BeatmapSet");

	let beatmap_info = {
		title: "",
		versions: [],
		beatmapids: [],
		star_rates: []
	};

	for (let i = 0; i < res_json.length; i++) {
		const json = res_json[i];
		if (i == 0) {
			beatmap_info.title = `${json.artist} - ${json.title}`;
		}

		if (json.diff_size == "4") {
			beatmap_info.versions.push(json.version);
			beatmap_info.beatmapids.push(json.beatmap_id);
			beatmap_info.star_rates.push(json.difficultyrating);
		}
	}

	return beatmap_info;
};

const GetFCCount = async (beatmapid, star_rate) => {
	const request_res = await GetReq(`https://osu.ppy.sh/api/get_scores?k=${apitoken}&m=3&limit=100&b=${beatmapid}`);
	const res_json = JSON.parse(request_res);
	if (res_json.length == 0) throw new Error("Not Found This Beatmap Ranking");

	let ranking_maxcombo = 0;
	res_json.forEach(json => {
		const json_combo = Number(json.maxcombo);
		const json_countmiss = Number(json.countmiss);
		if (json_countmiss == 0 && json_combo > ranking_maxcombo) ranking_maxcombo = json_combo;
	});

	if (ranking_maxcombo == 0) return 0;

	let FC_count = 0;
	for (let i = 0; i < res_json.length; i++) {
		const json = res_json[i];
		if (new Date(`${json.date} UTC`) > start_date) continue;

		if (json.rank.startsWith("X")) FC_count++;
		else if (Number(json.countmiss) == 0 && (ranking_maxcombo - Math.min(600, Number(star_rate) * 120) /* Number(star_rate) * 200 */) <= Number(json.maxcombo)) FC_count++; // 50 >= 1 or 100 >= 1 or 200 >= 1
	}

	return FC_count;
};

const book = XLSX.readFile("./export_temp.xlsx");
const sheet1 = book.Sheets["Sheet1"];
let cell_row = 5;

const SaveXLSX = () => {
	sheet1["!ref"] = `A1:E${cell_row}`;
	book.Sheets["Sheet1"] = sheet1;
	XLSX.writeFile(book, `./${string_start_date(true)}_Result.xlsx`, { type: "xlsx" });
};

process.on("SIGINT", () => {
	SaveXLSX();
	process.exit();
});

(async () => {
	console.log("=====================================\n||                                 ||\n|| osu!mania 4k Beatmap FC Counter ||\n||                                 ||\n=====================================");
	console.log();

	const read_text = await fs.readFile("./ranked_list.txt", { encoding: "utf8", flag: "r" });
	const beatmapsetids = read_text.split("\n");
	console.log(beatmapsetids);

	start_date = new Date();
	console.log(`Start Date: ${string_start_date(false)}`);
	sheet1["E3"] = { v: `Date to be counted: ${string_start_date(false)}`, t: 's', w: `Date to be counted: ${string_start_date(false)}` };

	for (let i = 0; i < beatmapsetids.length; i++) {
		const beatmapsetid = beatmapsetids[i];
		if (beatmapsetid == "") continue;

		console.log(`Current BeatmapSetID: ${beatmapsetid}`);
		const beatmap_info = await GetBeatmapID(beatmapsetid);

		console.log(beatmap_info.title);
		for (let n = 0; n < beatmap_info.beatmapids.length; n++) {
			const beatmapid = beatmap_info.beatmapids[n];
			const star_rate = beatmap_info.star_rates[n];
			const version = beatmap_info.versions[n];
			const FC_count = await GetFCCount(beatmapid, star_rate);

			console.log(`  ${version}[${beatmapid}](☆${star_rate}): ${FC_count >= 100 ? "100+" : FC_count}`);

			sheet1[`B${cell_row}`] = { v: beatmap_info.title, t: 's', w: beatmap_info.title };
			sheet1[`C${cell_row}`] = { v: version, t: 's', w: version };
			sheet1[`D${cell_row}`] = { v: "■", t: 's', f: `HYPERLINK("${`https://osu.ppy.sh/beatmapsets/${beatmapsetid}#mania/${beatmapid}`}", "■")`, w: "■" };
			sheet1[`E${cell_row}`] = { v: FC_count, t: 'n', w: String(FC_count) };

			cell_row++;
		}
	}

	SaveXLSX();
})();
