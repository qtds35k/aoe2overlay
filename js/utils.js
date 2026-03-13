(function (root, factory) {
    const exports = factory();

    if (typeof module !== "undefined" && module.exports) {
        module.exports = exports;
    }

    root.OverlayUtils = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    const UNKNOWN_VALUE = "???";
    const REGEX_PLAYER_NAME = /.*(?=\s\(\d+\))/;
    const REGEX_PLAYER_ELO = /\d+(?=\))/;
    const REGEX_PLAYER_WINRATE = /\d+%/;
    const REGEX_PLAYER_TOTAL_GAMES = /(\d{1,3},)*(\d+)(?=\sgames)/;
    const LIGHT_COLOR_IDS = [3, 4, 5, 8];

    function parseNightbotResponse(text) {
        const safeText = typeof text === "string" ? text : "";
        return {
            playerName: safeText.match(REGEX_PLAYER_NAME)?.[0] ?? UNKNOWN_VALUE,
            playerCurrentElo: safeText.match(REGEX_PLAYER_ELO)?.[0] ?? UNKNOWN_VALUE,
            playerTotalGames: safeText.match(REGEX_PLAYER_TOTAL_GAMES)?.[0] ?? UNKNOWN_VALUE,
            playerWinrate: safeText.match(REGEX_PLAYER_WINRATE)?.[0] ?? UNKNOWN_VALUE
        };
    }

    function getMaxElo(ratingHistory) {
        if (!Array.isArray(ratingHistory) || ratingHistory.length === 0) {
            return UNKNOWN_VALUE;
        }

        const ratings = ratingHistory
            .map(entry => entry?.rating)
            .filter(rating => Number.isFinite(rating));
        return ratings.length > 0 ? Math.max(...ratings) : UNKNOWN_VALUE;
    }

    function getLeaderboardWinrate(leaderboard) {
        if (!leaderboard || !Number.isFinite(leaderboard.wins) || !Number.isFinite(leaderboard.games) || leaderboard.games === 0) {
            return UNKNOWN_VALUE;
        }

        return `${Math.round((leaderboard.wins / leaderboard.games) * 100)}%`;
    }

    function getMatchPlayers(match) {
        if (Array.isArray(match?.players)) {
            return match.players;
        }

        if (!Array.isArray(match?.teams)) {
            return [];
        }

        return match.teams.reduce((players, team) => {
            if (Array.isArray(team?.players)) {
                players.push(...team.players);
            }
            return players;
        }, []);
    }

    function getMatchPlayerCount(match) {
        return Number.isFinite(match?.num_players) ? match.num_players : getMatchPlayers(match).length;
    }

    function isRanked1v1Match(match) {
        const leaderboardId = match?.leaderboard_id ?? match?.leaderboardId;
        return leaderboardId === 3 || leaderboardId === "rm_1v1";
    }

    function getRelevantMatches(matches, any1v1, limit = 7) {
        if (!Array.isArray(matches)) {
            return [];
        }

        return (any1v1
            ? matches.filter(match => getMatchPlayerCount(match) === 2)
            : matches.filter(match => isRanked1v1Match(match) && getMatchPlayerCount(match) === 2)
        ).slice(0, limit);
    }

    function getOpponentFromMatch(match, streamerProfileId) {
        return getMatchPlayers(match).find(player => player.profile_id !== parseInt(streamerProfileId, 10) && player.profileId !== parseInt(streamerProfileId, 10)) ?? null;
    }

    function getPlayerFromMatch(match, profileId) {
        return getMatchPlayers(match).find(player => player.profile_id === Number(profileId) || player.profileId === Number(profileId)) ?? null;
    }

    function getCivEntry(stringsLookup, civCode) {
        const civEntries = stringsLookup?.civ ?? [];
        const normalizedCivCode = typeof civCode === "string" ? civCode.toLowerCase() : civCode;
        return civEntries.find(civ =>
            civ.id === normalizedCivCode
            || civ.id === Number(normalizedCivCode)
            || civ.slug === normalizedCivCode
            || civ.string?.toLowerCase() === normalizedCivCode
        ) ?? {
            id: civCode,
            string: typeof civCode === "string" ? civCode : `Civ ${civCode}`
        };
    }

    function getLastUsedCivs(matches, profileId, stringsLookup, any1v1, limit = 7) {
        return getRelevantMatches(matches, any1v1, limit).reduce((lastUsedCivs, match) => {
            const player = getPlayerFromMatch(match, profileId);
            if (!player) {
                return lastUsedCivs;
            }

            lastUsedCivs.push(getCivEntry(stringsLookup, player.civ));
            return lastUsedCivs;
        }, []);
    }

    function isLightColor(colorId) {
        return LIGHT_COLOR_IDS.includes(colorId);
    }

    return {
        UNKNOWN_VALUE,
        parseNightbotResponse,
        getMaxElo,
        getLeaderboardWinrate,
        getMatchPlayers,
        getRelevantMatches,
        getOpponentFromMatch,
        getPlayerFromMatch,
        getCivEntry,
        getLastUsedCivs,
        isLightColor
    };
});
