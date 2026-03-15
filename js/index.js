const API_BASE = "https://api.aoe2net.com";
const REFRESH_INTERVAL_MS = 420000;
const overlayUtils = typeof window !== "undefined" && window.OverlayUtils
    ? window.OverlayUtils
    : require("./utils");
const {
    UNKNOWN_VALUE,
    parseNightbotResponse,
    getMaxElo,
    getLeaderboardWinrate,
    getRelevantMatches,
    getOpponentFromMatch,
    getPlayerFromMatch,
    getCivEntry,
    getLastUsedCivs,
    isLightColor
} = overlayUtils;

function getRepoBasePath() {
    const pathSegments = window.location.pathname.split("/").filter(Boolean);
    return pathSegments[0] === "aoe2overlay" ? "/aoe2overlay" : "";
}

function createUnknownPlayerStats() {
    return {
        playerName: UNKNOWN_VALUE,
        playerCurrentElo: UNKNOWN_VALUE,
        playerTotalGames: UNKNOWN_VALUE,
        playerWinrate: UNKNOWN_VALUE,
        playerMaxElo: UNKNOWN_VALUE,
        lastUsedCivs: [],
        lastPlayerColor: null,
        lastOpponentColor: null
    };
}

function createFallbackCivBadge(civEntry, width) {
    const badge = document.createElement("span");
    badge.innerText = civEntry?.string?.slice(0, 3)?.toUpperCase() ?? "???";
    badge.style.width = `${width}px`;
    badge.style.height = `${width}px`;
    badge.style.display = "inline-flex";
    badge.style.alignItems = "center";
    badge.style.justifyContent = "center";
    badge.style.backgroundColor = "black";
    badge.style.color = "white";
    badge.style.fontSize = "18px";
    badge.style.fontWeight = "bold";
    return badge;
}

function createCivImage(filename, altText, width) {
    const image = document.createElement("img");
    image.src = filename;
    image.alt = altText;
    image.style.width = `${width}px`;
    image.className = "civIcon";
    return image;
}

function renderCivHistory(containerId, civEntries, side) {
    console.log(`[CivHistory] Rendering for side ${side}, civs:`, civEntries.map(c => c.string));
    const container = document.getElementById(containerId);
    container.replaceChildren();
    
    // Symmetrical "Stand-off": Most recent icons meet in the center.
    // Left player: Row-reverse puts index 0 (most recent/biggest) on the right.
    // Right player: Row puts index 0 on the left.
    container.style.flexDirection = side === "left" ? "row-reverse" : "row"; 

    civEntries.forEach((civEntry, index) => {
        const width = 90 - (9 * index);
        console.log(`[CivHistory] Icon ${civEntry.string} index ${index} width ${width}`);
        const iconElement = civEntry?.icon
            ? createCivImage(`img/icons/${civEntry.icon}`, civEntry.string, width)
            : createFallbackCivBadge(civEntry, width);
        container.appendChild(iconElement);
    });
}

function renderBackgroundEmblem(side, civEntry) {
    const containerId = `backgroundEmblem${side}`;
    const $container = $(`#${containerId}`);
    
    if ($container.length === 0) return;

    $container.empty();
    if (civEntry && civEntry.emblem) {
        const emblem = document.createElement("img");
        emblem.src = `img/emblems/${civEntry.emblem}`;
        emblem.alt = civEntry.string;
        emblem.className = "backgroundEmblem";
        $container.append(emblem);
    }
}

function applyMatchColors(playerStats, stringsLookup) {
    setTextShadow("playerName1", playerStats.lastPlayerColor, stringsLookup);
    setTextShadow("playerName2", playerStats.lastOpponentColor, stringsLookup);
}

function renderPlayerStats(side, playerStats) {
    console.log(`[Render] Rendering stats for side ${side}:`, playerStats);
    
    const elements = {
        playerName: `playerName${side}`,
        playerCurrentElo: `playerCurrentElo${side}`,
        playerMaxElo: `playerMaxElo${side}`,
        playerTotalGames: `playerTotalGames${side}`,
        playerWinrate: `playerWinrate${side}`
    };

    for (const [key, id] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) {
            el.innerText = playerStats[key] ?? UNKNOWN_VALUE;
        } else {
            console.warn(`[Render] Element NOT FOUND: ${id}`);
        }
    }

    renderCivHistory(`lastUsedCivs${side}`, playerStats.lastUsedCivs, side === 1 ? "left" : "right");
    renderBackgroundEmblem(side, playerStats.lastUsedCivs[0]);
}

function setTextShadow(playerNameId, colorCode, stringsLookup) {
    const playerColor = stringsLookup.color.find(color => color.id === colorCode);
    const playerNameElement = document.getElementById(playerNameId);
    if (!playerColor || !playerNameElement) {
        return;
    }

    playerNameElement.style.color = playerColor.string.toLowerCase();

    if (isLightColor(colorCode)) {
        playerNameElement.style.textShadow = "0px 0px 6.18px white";
        return;
    }

    playerNameElement.style.textShadow = "0.618px 0.618px 3px white, -0.618px -0.618px 3px white, 0px 0px 6.18px white";
}

async function getOpponentProfileId(profileId, any1v1) {
    const urlMatches = `https://data.aoe2companion.com/api/matches?profile_ids=${profileId}&leaderboard_ids=rm_1v1`;

    try {
        const response = await fetch(urlMatches);
        const data = await response.json();
        const filteredMatch = getRelevantMatches(data?.matches ?? data, any1v1, 1)[0];

        if (!filteredMatch) return null;

        const opponent = getOpponentFromMatch(filteredMatch, profileId);
        return (opponent?.profile_id ?? opponent?.profileId)?.toString() ?? null;
    } catch (error) {
        console.error(error);
        return null;
    }
}

async function getPlayerStats(profileId, any1v1, stringsLookup) {
    if (!profileId) {
        return createUnknownPlayerStats();
    }

    const urlPlayerStatus = `${API_BASE}/api/nightbot/rank?profile_id=${profileId}`;
    const urlProfile = `${API_BASE}/api/profiles/${profileId}`;
    const urlMatches = `https://data.aoe2companion.com/api/matches?profile_ids=${profileId}&leaderboard_ids=rm_1v1`;
    const urlCivs = `${API_BASE}/api/civs/${profileId}`;

    const [playerStatusRaw, profileData, matchesResponse] = await Promise.all([
        $.ajax({ url: urlPlayerStatus }),
        $.getJSON(urlProfile),
        $.getJSON(urlMatches)
    ]);

    const parsedPlayerStatus = parseNightbotResponse(playerStatusRaw);
    const rm1v1Leaderboard = profileData?.leaderboards?.find(leaderboard => leaderboard.leaderboardId === "rm_1v1") ?? null;
    const rm1v1Ratings = profileData?.ratings?.find(ratingSet => ratingSet.leaderboardId === "rm_1v1")?.ratings ?? [];
    const matches = Array.isArray(matchesResponse) ? matchesResponse : matchesResponse?.matches ?? [];

    let playerName = parsedPlayerStatus.playerName !== UNKNOWN_VALUE
        ? parsedPlayerStatus.playerName
        : profileData?.name ?? UNKNOWN_VALUE;
    const playerCurrentElo = parsedPlayerStatus.playerCurrentElo !== UNKNOWN_VALUE
        ? parsedPlayerStatus.playerCurrentElo
        : rm1v1Leaderboard?.rating?.toString() ?? UNKNOWN_VALUE;
    const playerTotalGames = parsedPlayerStatus.playerTotalGames !== UNKNOWN_VALUE
        ? parsedPlayerStatus.playerTotalGames
        : rm1v1Leaderboard?.games?.toLocaleString?.() ?? UNKNOWN_VALUE;
    const playerWinrate = parsedPlayerStatus.playerWinrate !== UNKNOWN_VALUE
        ? parsedPlayerStatus.playerWinrate
        : getLeaderboardWinrate(rm1v1Leaderboard);
    const playerMaxElo = rm1v1Leaderboard?.maxRating ?? getMaxElo(rm1v1Ratings);
    let lastPlayerColor = null;
    let lastOpponentColor = null;
    const relevantMatches = getRelevantMatches(matches, any1v1);
    let lastUsedCivs = getLastUsedCivs(matches, profileId, stringsLookup, any1v1);

    // If no match history available, fall back to most-played civs from the API
    if (lastUsedCivs.length === 0) {
        try {
            const civData = await $.getJSON(urlCivs);
            if (Array.isArray(civData) && civData.length > 0) {
                lastUsedCivs = civData.slice(0, 7).map(c => getCivEntry(stringsLookup, c.slug) || getCivEntry(stringsLookup, c.name));
            }
        } catch (e) {
            // silently ignore — civs just won't show
        }
    }

    const latestMatch = relevantMatches[0];
    const latestPlayer = getPlayerFromMatch(latestMatch, profileId);
    const latestOpponent = getOpponentFromMatch(latestMatch, profileId);

    if (latestPlayer) {
        lastPlayerColor = latestPlayer.color ?? null;
        lastOpponentColor = latestOpponent?.color ?? null;
        if (playerName === UNKNOWN_VALUE && latestPlayer.name) {
            playerName = latestPlayer.name;
        }
    }

    return {
        playerName,
        playerCurrentElo,
        playerTotalGames,
        playerWinrate,
        playerMaxElo,
        lastUsedCivs,
        lastPlayerColor,
        lastOpponentColor
    };
}

async function main() {
    const urlParams = new URLSearchParams(window.location.search);
    const stringsLookupPath = `${getRepoBasePath()}/resource/strings.json`;
    const any1v1 = urlParams.get("any1v1") === "true";
    const streamerProfileId = urlParams.get("profileId");
    // Manual mode: streamer can pass ?opponent=<profile_id> to bypass broken match detection
    const manualOpponentId = urlParams.get("opponent") ?? null;

    if (!streamerProfileId) {
        return;
    }

    try {
        const stringsLookup = await $.getJSON(stringsLookupPath);
        // Use manual opponent if provided, otherwise attempt API detection (may return null)
        const opponentProfileId = manualOpponentId
            ?? await getOpponentProfileId(streamerProfileId, any1v1);
        const [streamerResult, opponentResult] = await Promise.allSettled([
            getPlayerStats(streamerProfileId, any1v1, stringsLookup),
            getPlayerStats(opponentProfileId, any1v1, stringsLookup)
        ]);

        const streamerStats = streamerResult.status === "fulfilled"
            ? streamerResult.value
            : createUnknownPlayerStats();
        const opponentStats = opponentResult.status === "fulfilled"
            ? opponentResult.value
            : createUnknownPlayerStats();

        applyMatchColors(streamerStats, stringsLookup);
        renderPlayerStats(1, streamerStats);
        renderPlayerStats(2, opponentStats);
    } catch (error) {
        console.error(error);
    }

    setInterval(() => {
        location.reload();
    }, REFRESH_INTERVAL_MS);
}

$(document).ready(function() {
    console.log("[Main] DOM Ready. Starting main...");
    main();
});
