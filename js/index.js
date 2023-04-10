// Reason for this wrapping main() is because we need to await opponentProfileId to be resolved.
async function main() {
    const urlParams = new URLSearchParams(window.location.search);
    const profileId = urlParams.get('profileId');

    // streamerProfileId is grabbed from query param in url, then is used to get current opponentProfileId 
    var streamerProfileId = profileId;
    var opponentProfileId = await getOpponentProfileId(streamerProfileId);

    // Populate streamer section.
    getPlayerStats(streamerProfileId).then(playerStats => {
        console.log(playerStats);

        document.getElementById("playerName1").innerText = playerStats.playerName;
        document.getElementById("playerCurrentElo1").innerText = playerStats.playerCurrentElo;
        document.getElementById("playerMaxElo1").innerText = playerStats.playerMaxElo;
        document.getElementById("playerTotalGames1").innerText = playerStats.playerTotalGames;
        document.getElementById("playerWinrate1").innerText = playerStats.playerWinrate;

        const lastUsedCivsElement = document.getElementById("lastUsedCivs1");
        // Streamer's civ list is reversed for symmetric display.
        playerStats.lastUsedCivs.reverse().forEach((civ) => {
            const img = document.createElement("img");
            img.src = `img/${civ}.png`;
            img.alt = civ;
            lastUsedCivsElement.appendChild(img);
        });
    }).catch(error => {
        console.error(error);
    });

    // Populate opponent section.
    getPlayerStats(opponentProfileId).then(playerStats => {
        console.log(playerStats);

        document.getElementById("playerName2").innerText = playerStats.playerName;
        document.getElementById("playerCurrentElo2").innerText = playerStats.playerCurrentElo;
        document.getElementById("playerMaxElo2").innerText = playerStats.playerMaxElo;
        document.getElementById("playerTotalGames2").innerText = playerStats.playerTotalGames;
        document.getElementById("playerWinrate2").innerText = playerStats.playerWinrate;

        const lastUsedCivsElement = document.getElementById("lastUsedCivs2");
        // Streamer's civ list is reversed for symmetric display.
        playerStats.lastUsedCivs.forEach((civ) => {
            const img = document.createElement("img");
            img.src = `img/${civ}.png`;
            img.alt = civ;
            lastUsedCivsElement.appendChild(img);
        });
    }).catch(error => {
        console.error(error);
    });

    // Get opponent's profileId from last 5 games, assuming at least 1 ranked 1v1 game is included here.
    async function getOpponentProfileId(profileId) {
        const urlMatches = 'https://aoe2.net/api/player/matches?game=aoe2de&count=5&profile_id=' + profileId;

        try {
            const response = await fetch(urlMatches);
            const data = await response.json();

            const filteredMatches = data.filter(match => match.leaderboard_id === 3).slice(0, 5);
            for (let i = 0; i < filteredMatches[0].players.length; i++) {
                const player = filteredMatches[0].players[i];
                if (player.profile_id !== streamerProfileId) {
                    const opponentProfileId = player.profile_id;
                    return opponentProfileId.toString();
                }
            }
        } catch (error) {
            console.error(error);
        }
    }

    // Get player's name, current/max elo, total games played, winrate, and used civs in last 5 ranked 1v1 games.
    async function getPlayerStats(profileId) {
        const urlPlayerStatus = `https://aoe2.net/api/nightbot/rank?game=aoe2de&leaderboard_id=3&profile_id=${profileId}&flag=false`;
        const urlRatingHistory = `https://aoe2.net/api/player/ratinghistory?game=aoe2de&leaderboard_id=3&profile_id=${profileId}&count=100`;
        const urlMatches = `https://aoe2.net/api/player/matches?game=aoe2de&count=20&profile_id=${profileId}`;

        const regexPlayerName = /.*(?=\s\(\d+\))/;
        const regexPlayerElo = /\d+(?=\))/;
        const regexPlayerWinrate = /\d+%/;
        const regexPlayerTotalGames = /(\d+)(?=\sgames)/;

        const [playerStatus, ratingHistory, matches, civCodeTable] = await Promise.all([
            $.ajax({ url: urlPlayerStatus }),
            $.getJSON(urlRatingHistory),
            $.getJSON(urlMatches),
            $.getJSON('/aoe2overlay/resource/civ.json')
        ]);
        const playerName = playerStatus.match(regexPlayerName)[0];
        const playerCurrentElo = playerStatus.match(regexPlayerElo)[0];
        const playerTotalGames = playerStatus.match(regexPlayerTotalGames)[0];
        const playerWinrate = playerStatus.match(regexPlayerWinrate)[0];
        const ratings = ratingHistory.map(entry => entry.rating);
        const playerMaxElo = Math.max(...ratings);

        // Number of last used civs configured here.
        const filteredMatches = matches.filter(match => match.leaderboard_id === 3).slice(0, 7);
        const lastUsedCivs = [];

        for (let i = 0; i < filteredMatches.length; i++) {
            const player = filteredMatches[i].players.find(p => p.profile_id == profileId);
            const civCode = player.civ;
            const civString = civCodeTable.civ.find(c => c.id === civCode).string;
            lastUsedCivs.push(civString.toLowerCase());
        }

        return {
            playerName,
            playerCurrentElo,
            playerTotalGames,
            playerWinrate,
            playerMaxElo,
            lastUsedCivs
        };
    }

}

// Actual execution happens here.
main();
