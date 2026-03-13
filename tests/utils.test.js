const {
    parseNightbotResponse,
    getMaxElo,
    getLeaderboardWinrate,
    getMatchPlayers,
    getRelevantMatches,
    getLastUsedCivs,
    getOpponentFromMatch,
    getPlayerFromMatch,
    getCivEntry,
    isLightColor
} = require("../js/utils");

describe("parseNightbotResponse", () => {
    test("parses a well-formed nightbot response", () => {
        const input = "TheViper (2100) | Wins: 500 Losses: 200 | 71% (700 games)";
        const result = parseNightbotResponse(input);
        expect(result.playerName).toBe("TheViper");
        expect(result.playerCurrentElo).toBe("2100");
        expect(result.playerWinrate).toBe("71%");
        expect(result.playerTotalGames).toBe("700");
    });

    test("handles player names with spaces", () => {
        const input = "Mr Yo (1850) | Wins: 300 Losses: 150 | 67% (450 games)";
        expect(parseNightbotResponse(input).playerName).toBe("Mr Yo");
    });

    test("handles large game counts with commas", () => {
        const input = "Hera (2200) | Wins: 1200 Losses: 800 | 60% (2,000 games)";
        expect(parseNightbotResponse(input).playerTotalGames).toBe("2,000");
    });

    test("returns ??? for malformed input", () => {
        const result = parseNightbotResponse("");
        expect(result.playerName).toBe("???");
        expect(result.playerCurrentElo).toBe("???");
        expect(result.playerWinrate).toBe("???");
        expect(result.playerTotalGames).toBe("???");
    });
});

describe("getMaxElo", () => {
    test("returns the highest rating", () => {
        const history = [{ rating: 1800 }, { rating: 2100 }, { rating: 1950 }];
        expect(getMaxElo(history)).toBe(2100);
    });

    test("returns ??? for empty array", () => {
        expect(getMaxElo([])).toBe("???");
    });

    test("returns ??? for null", () => {
        expect(getMaxElo(null)).toBe("???");
    });
});

describe("getLeaderboardWinrate", () => {
    test("formats a rounded winrate percentage", () => {
        expect(getLeaderboardWinrate({ wins: 531, games: 1024 })).toBe("52%");
    });

    test("returns ??? when games are unavailable", () => {
        expect(getLeaderboardWinrate(null)).toBe("???");
        expect(getLeaderboardWinrate({ wins: 1, games: 0 })).toBe("???");
    });
});

describe("getOpponentFromMatch", () => {
    const match = {
        players: [
            { profile_id: 123, name: "Streamer" },
            { profile_id: 456, name: "Opponent" }
        ]
    };

    test("returns the player that is not the streamer", () => {
        expect(getOpponentFromMatch(match, "123").name).toBe("Opponent");
    });

    test("handles streamer as second player", () => {
        expect(getOpponentFromMatch(match, "456").name).toBe("Streamer");
    });

    test("supports the newer teams-based match shape", () => {
        const matchWithTeams = {
            teams: [
                { players: [{ profileId: 123, name: "Streamer" }] },
                { players: [{ profileId: 456, name: "Opponent" }] }
            ]
        };
        expect(getOpponentFromMatch(matchWithTeams, "123").name).toBe("Opponent");
    });
});

describe("getMatchPlayers", () => {
    test("returns players directly when the legacy shape is used", () => {
        const players = [{ profile_id: 1 }, { profile_id: 2 }];
        expect(getMatchPlayers({ players })).toBe(players);
    });

    test("flattens teams when the live AoE2Companion shape is used", () => {
        expect(getMatchPlayers({
            teams: [
                { players: [{ profileId: 1 }] },
                { players: [{ profileId: 2 }, { profileId: 3 }] }
            ]
        })).toEqual([{ profileId: 1 }, { profileId: 2 }, { profileId: 3 }]);
    });
});

describe("getRelevantMatches", () => {
    const matches = [
        { leaderboard_id: 0, num_players: 2 },
        { leaderboard_id: 3, num_players: 2 },
        { leaderboard_id: 3, num_players: 4 }
    ];

    test("filters ranked 1v1 matches by default", () => {
        expect(getRelevantMatches(matches, false)).toEqual([{ leaderboard_id: 3, num_players: 2 }]);
    });

    test("filters any 2-player matches when requested", () => {
        expect(getRelevantMatches(matches, true)).toEqual([
            { leaderboard_id: 0, num_players: 2 },
            { leaderboard_id: 3, num_players: 2 }
        ]);
    });

    test("supports the newer rm_1v1 leaderboard shape", () => {
        const liveMatches = [
            { leaderboardId: "rm_1v1", teams: [{ players: [{ profileId: 1 }] }, { players: [{ profileId: 2 }] }] },
            { leaderboardId: "rm_team", teams: [{ players: [{ profileId: 1 }, { profileId: 3 }] }, { players: [{ profileId: 2 }, { profileId: 4 }] }] }
        ];
        expect(getRelevantMatches(liveMatches, false)).toHaveLength(1);
    });
});

describe("getPlayerFromMatch", () => {
    test("finds the requested player in the legacy match shape", () => {
        expect(getPlayerFromMatch({
            players: [
                { profile_id: 123, name: "Streamer" },
                { profile_id: 456, name: "Opponent" }
            ]
        }, "456")).toEqual({ profile_id: 456, name: "Opponent" });
    });

    test("finds the requested player in the live teams-based match shape", () => {
        expect(getPlayerFromMatch({
            teams: [
                { players: [{ profileId: 123, name: "Streamer" }] },
                { players: [{ profileId: 456, name: "Opponent" }] }
            ]
        }, 123)).toEqual({ profileId: 123, name: "Streamer" });
    });
});

describe("getLastUsedCivs", () => {
    const stringsLookup = {
        civ: [
            { id: 1, string: "Britons", icon: "britons.png", emblem: "britons.png" },
            { id: 5, string: "Franks", icon: "franks.png", emblem: "franks.png" },
            { id: 10, string: "Mongols", icon: "mongols.png", emblem: "mongols.png" }
        ]
    };

    const makeMatch = (leaderboardId, numPlayers, profileId, civId) => ({
        leaderboard_id: leaderboardId,
        num_players: numPlayers,
        players: [
            { profile_id: profileId, civ: civId },
            { profile_id: 999, civ: 1 }
        ]
    });

    test("extracts civ entries from ranked 1v1 matches", () => {
        const matches = [
            makeMatch(3, 2, 123, 5),
            makeMatch(3, 2, 123, 10),
            makeMatch(0, 2, 123, 1)
        ];
        const civs = getLastUsedCivs(matches, 123, stringsLookup, false);
        expect(civs.map(civ => civ.string)).toEqual(["Franks", "Mongols"]);
    });

    test("respects limit", () => {
        const matches = Array(10).fill(null).map(() => makeMatch(3, 2, 123, 1));
        expect(getLastUsedCivs(matches, 123, stringsLookup, false, 3)).toHaveLength(3);
    });

    test("uses any1v1 filter when flag is set", () => {
        const matches = [
            makeMatch(0, 2, 123, 5),
            makeMatch(3, 2, 123, 10),
            makeMatch(3, 4, 123, 1)
        ];
        const civs = getLastUsedCivs(matches, 123, stringsLookup, true);
        expect(civs.map(civ => civ.string)).toEqual(["Franks", "Mongols"]);
    });

    test("supports the newer civ slug fields from live match data", () => {
        const matches = [
            {
                leaderboardId: "rm_1v1",
                teams: [
                    { players: [{ profileId: 123, civ: "magyars" }] },
                    { players: [{ profileId: 999, civ: "britons" }] }
                ]
            }
        ];
        const civs = getLastUsedCivs(matches, 123, {
            civ: [
                { id: 1, string: "Britons", slug: "britons" },
                { id: 22, string: "Magyars", slug: "magyars" }
            ]
        }, false);
        expect(civs.map(civ => civ.string)).toEqual(["Magyars"]);
    });
});

describe("getCivEntry", () => {
    const stringsLookup = {
        civ: [
            { id: 1, string: "Britons", slug: "britons" },
            { id: 22, string: "Magyars", slug: "magyars" }
        ]
    };

    test("matches civs by numeric id", () => {
        expect(getCivEntry(stringsLookup, 22).string).toBe("Magyars");
    });

    test("matches civs by slug from live match data", () => {
        expect(getCivEntry(stringsLookup, "britons").string).toBe("Britons");
    });

    test("falls back to a synthetic entry when the civ is unknown", () => {
        expect(getCivEntry(stringsLookup, "futureciv")).toEqual({
            id: "futureciv",
            string: "futureciv"
        });
    });
});

describe("isLightColor", () => {
    test("identifies light color IDs", () => {
        expect(isLightColor(3)).toBe(true);
        expect(isLightColor(4)).toBe(true);
        expect(isLightColor(5)).toBe(true);
        expect(isLightColor(8)).toBe(true);
    });

    test("identifies dark color IDs", () => {
        expect(isLightColor(1)).toBe(false);
        expect(isLightColor(2)).toBe(false);
        expect(isLightColor(7)).toBe(false);
    });
});
