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

function applyColorAndShadow(element, colorCode, stringsLookup) {
    if (colorCode == null) return;
    const playerColor = stringsLookup.color.find(color => color.id === colorCode);
    if (!playerColor || !element) {
        return;
    }

    element.style.color = playerColor.string.toLowerCase();

    if (isLightColor(colorCode)) {
        element.style.textShadow = "0px 0px 2.18px white";
        return;
    }

    element.style.textShadow = "0.618px 0.618px 3px white, -0.618px -0.618px 3px white, 0px 0px 2.18px white";
}

function applyColorOnly(element, colorCode, stringsLookup) {
    if (colorCode == null) return;
    const playerColor = stringsLookup.color.find(color => color.id === colorCode);
    if (!playerColor || !element) {
        return;
    }
    element.style.color = playerColor.string.toLowerCase();
}

function setTextShadow(playerNameId, colorCode, stringsLookup) {
    const element = document.getElementById(playerNameId);
    applyColorAndShadow(element, colorCode, stringsLookup);
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
    const urlProfile = `https://data.aoe2companion.com/api/profiles/${profileId}`;
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

async function fetchTeamPlayerStats(player) {
    const profId = player.profileId || player.profile_id;
    if (!profId) return _createFallbackTeamStats(player);
    
    try {
        const response = await fetch(`https://data.aoe2companion.com/api/profiles/${profId}`);
        if (!response.ok) throw new Error("Profile fetch failed");
        const data = await response.json();
        
        const rm1v1 = data?.leaderboards?.find(l => l.leaderboardId === "rm_1v1");
        const rmTeam = data?.leaderboards?.find(l => l.leaderboardId === "rm_team");
        
        return {
            player: player,
            rm1v1Elo: rm1v1?.rating ?? UNKNOWN_VALUE,
            rm1v1Winrate: getLeaderboardWinrate(rm1v1),
            rmTeamElo: rmTeam?.rating ?? UNKNOWN_VALUE,
            rmTeamGames: rmTeam?.games?.toLocaleString?.() ?? UNKNOWN_VALUE
        };
    } catch(e) {
        console.error("fetchTeamPlayerStats error:", e);
        return _createFallbackTeamStats(player);
    }
}

function _createFallbackTeamStats(player) {
    return {
        player: player,
        rm1v1Elo: UNKNOWN_VALUE,
        rm1v1Winrate: UNKNOWN_VALUE,
        rmTeamElo: player.rating ?? UNKNOWN_VALUE, 
        rmTeamGames: UNKNOWN_VALUE
    };
}

function renderTeamRows(tableId, statsList, stringsLookup, maxTeamElo) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!tbody) return;
    tbody.innerHTML = ''; 
    
    for(const stats of statsList) {
        const p = stats.player;
        const tr = document.createElement('tr');
        
        const nameTd = document.createElement('td');
        nameTd.className = "statsValue statsValuePlayerName";
        nameTd.innerText = `[${p.color ?? '?'}] ${p.name ?? "Unknown"}`;
        applyColorOnly(nameTd, p.color, stringsLookup);

        const v1Td = document.createElement('td');
        v1Td.className = "statsValue";
        v1Td.innerText = `${stats.rm1v1Elo} (${stats.rm1v1Winrate})`;

        const teamEloTd = document.createElement('td');
        teamEloTd.className = "statsValueTeamElo";
        if (stats.rmTeamElo !== UNKNOWN_VALUE && parseInt(stats.rmTeamElo) >= maxTeamElo) {
            teamEloTd.classList.add("highest-team-elo");
        }
        teamEloTd.innerText = `${stats.rmTeamElo}`;

        const teamGamesTd = document.createElement('td');
        teamGamesTd.className = "statsValue";
        teamGamesTd.innerText = `${stats.rmTeamGames}`;

        tr.appendChild(nameTd);
        tr.appendChild(v1Td);
        tr.appendChild(teamEloTd);
        tr.appendChild(teamGamesTd);
        
        tbody.appendChild(tr);
    }
}

async function renderTeamGame(match, profileId, stringsLookup) {
    if (!match || !match.teams) return;

    let streamerTeam = match.teams.find(t => t.players.some(p => p.profileId?.toString() === profileId.toString() || p.profile_id?.toString() === profileId.toString()));
    let opponentTeam = match.teams.find(t => t.teamId !== streamerTeam?.teamId);

    if (!streamerTeam || !opponentTeam) return;

    const streamerPlayer = streamerTeam.players.find(p => p.profileId?.toString() === profileId.toString() || p.profile_id?.toString() === profileId.toString());
    const streamerName = streamerPlayer?.name ?? "Streamer";
    const streamerCiv = streamerPlayer?.civ || streamerPlayer?.civName;
    const streamerCivEntry = streamerCiv ? getCivEntry(stringsLookup, streamerCiv) : null;
    
    // Sort opponent team to find least playerNumber (lowest color code)
    const sortedOpponents = [...opponentTeam.players].sort((a,b) => (a.color||99) - (b.color||99));
    const opponentMain = sortedOpponents[0];
    const opponentName = opponentMain?.name ?? "Opponent";
    const opponentCiv = opponentMain?.civ || opponentMain?.civName;
    const opponentCivEntry = opponentCiv ? getCivEntry(stringsLookup, opponentCiv) : null;
    
    console.log("[renderTeamGame] Opponent Main Selected:", opponentName, "Color:", opponentMain?.color, "from:", sortedOpponents.map(p => `${p.name} (${p.color})`));

    const streamerTeamNameElement = document.getElementById("playerNameTeam1");
    if (streamerTeamNameElement) {
        streamerTeamNameElement.innerText = `${streamerName}'s team`;
        applyColorAndShadow(streamerTeamNameElement, streamerPlayer?.color, stringsLookup);
    }
    
    const opponentTeamNameElement = document.getElementById("playerNameTeam2");
    if (opponentTeamNameElement) {
        opponentTeamNameElement.innerText = `${opponentName}'s team`;
        applyColorAndShadow(opponentTeamNameElement, opponentMain?.color, stringsLookup);
    }

    renderBackgroundEmblem("Team1", streamerCivEntry);
    renderBackgroundEmblem("Team2", opponentCivEntry);

    // Fetch all stats first
    const streamerStatsList = await Promise.all(streamerTeam.players.map(p => fetchTeamPlayerStats(p)));
    const opponentStatsList = await Promise.all(opponentTeam.players.map(p => fetchTeamPlayerStats(p)));
    
    const allStats = [...streamerStatsList, ...opponentStatsList];
    const maxTeamElo = Math.max(...allStats.map(s => s.rmTeamElo !== UNKNOWN_VALUE ? parseInt(s.rmTeamElo) || 0 : 0));

    // Sort players by color internally before rendering
    const sortPl = (a, b) => (a.player.color||99) - (b.player.color||99);
    
    renderTeamRows("statsTableTeam1", streamerStatsList.sort(sortPl), stringsLookup, maxTeamElo);
    renderTeamRows("statsTableTeam2", opponentStatsList.sort(sortPl), stringsLookup, maxTeamElo);
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
        
        const urlRecentMatches = `https://data.aoe2companion.com/api/matches?profile_ids=${streamerProfileId}&leaderboard_ids=rm_1v1,rm_team`;
        const recentMatchesResponse = await fetch(urlRecentMatches).catch(() => null);
        const recentData = recentMatchesResponse ? await recentMatchesResponse.json() : null;
        let latestMatch = Array.isArray(recentData) ? recentData[0] : (recentData?.matches?.[0] ?? null);

        if (latestMatch && latestMatch.leaderboardId === "rm_team") {
            document.getElementById('overlay-1v1').style.display = 'none';
            document.getElementById('overlay-team').style.display = '';
            await renderTeamGame(latestMatch, streamerProfileId, stringsLookup);
        } else {
            document.getElementById('overlay-team').style.display = 'none';
            document.getElementById('overlay-1v1').style.display = '';
            
            const opponentProfileId = manualOpponentId ?? await getOpponentProfileId(streamerProfileId, any1v1);
            const [streamerResult, opponentResult] = await Promise.allSettled([
                getPlayerStats(streamerProfileId, any1v1, stringsLookup),
                getPlayerStats(opponentProfileId, any1v1, stringsLookup)
            ]);

            const streamerStats = streamerResult.status === "fulfilled" ? streamerResult.value : createUnknownPlayerStats();
            const opponentStats = opponentResult.status === "fulfilled" ? opponentResult.value : createUnknownPlayerStats();

            applyMatchColors(streamerStats, stringsLookup);
            renderPlayerStats(1, streamerStats);
            renderPlayerStats(2, opponentStats);
        }
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
