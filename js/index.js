// Reason for this wrapping main() is because we need to await opponentProfileId to be resolved.
async function main() {
    const urlParams = new URLSearchParams(window.location.search);
    const corsProxyUrl = 'https://api.allorigins.win/raw?url=';
    // const gitRepoName = ''; // for local testing
    const gitRepoName = '/aoe2overlay'; // for github page endpoint
    const stringsLookupPath = `${gitRepoName}/resource/strings.json`;

    const streamerProfileId = urlParams.get('profileId');
    const opponentProfileId = await getOpponentProfileId(streamerProfileId);

    // Populate streamer section.
    getPlayerStats(streamerProfileId).then(playerStats => {
        console.log(playerStats);

        document.getElementById("playerName1").innerText = playerStats.playerName;
        setTextShadow("playerName1", playerStats.lastPlayerColor);
        // Setting opponent color here; if overlay's not displaying ongoing match, opponent might have had more games than streamer
        setTextShadow("playerName2", playerStats.lastOpponentColor);
        document.getElementById("playerCurrentElo1").innerText = playerStats.playerCurrentElo;
        document.getElementById("playerMaxElo1").innerText = playerStats.playerMaxElo;
        document.getElementById("playerTotalGames1").innerText = playerStats.playerTotalGames;
        document.getElementById("playerWinrate1").innerText = playerStats.playerWinrate;

        const images = [];
        playerStats.lastUsedCivs.forEach((civ, index) => {
            // civ emblem
            if (index == 0) {
                const img = document.createElement("img");
                img.src = `img/emblems/${civ}.png`;
                img.alt = civ;
                img.style.position = "absolute";
                img.style.bottom = "0";
                img.style.left = "0";
                img.style.width = "30%";
                img.style.opacity = 0.5;
                document.getElementById('lastUsedCivs1').appendChild(img);
            }
            
            // civ icon
            const img = document.createElement("img");
            img.src = `img/icons/${civ}.png`;
            img.alt = civ;
            img.style.width = 90 - (10 * index) + "px";
            img.style.backgroundColor = "black";
            images.unshift(img); // add to the beginning of the array
        });

        const lastUsedCivsElement = document.getElementById("lastUsedCivs1");
        images.forEach(img => lastUsedCivsElement.prepend(img)); // add images to the table cell

        // set table cell styles
        lastUsedCivsElement.style.display = "flex";
        lastUsedCivsElement.style.flexDirection = "row-reverse";
        lastUsedCivsElement.style.alignItems = "baseline";
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

        const images = [];
        playerStats.lastUsedCivs.forEach((civ, index) => {
            // civ emblem
            if (index == 0) {
                const img = document.createElement("img");
                img.src = `img/emblems/${civ}.png`;
                img.alt = civ;
                img.style.position = "absolute";
                img.style.bottom = "0";
                img.style.right = "0";
                img.style.width = "30%";
                img.style.opacity = 0.5;
                document.getElementById('lastUsedCivs2').appendChild(img);
            }
            
            // civ icon
            const img = document.createElement("img");
            img.src = `img/icons/${civ}.png`;
            img.alt = civ;
            img.style.width = 90 - (10 * index) + "px"; // set width
            img.style.backgroundColor = "black";
            images.push(img); // add to the end of the array
        });

        const lastUsedCivsElement = document.getElementById("lastUsedCivs2");
        images.forEach(img => lastUsedCivsElement.appendChild(img)); // add images to the table cell

        // set table cell styles
        lastUsedCivsElement.style.display = "flex";
        lastUsedCivsElement.style.flexDirection = "row";
        lastUsedCivsElement.style.alignItems = "baseline";
    }).catch(error => {
        console.error(error);
    });

    // Get opponent's profileId from last 50 games, assuming at least 1 ranked 1v1 game is included here.
    async function getOpponentProfileId(profileId) {
        const urlMatches = 'https://aoe2.net/api/player/matches?game=aoe2de&count=50&profile_id=' + profileId;
        try {
            const response = await fetch(corsProxyUrl + encodeURIComponent(urlMatches));
            const data = await response.json();

            const filteredMatches = data.filter(match => match.leaderboard_id === 3)[0];
            console.log(filteredMatches.players);

            for (let i = 0; i < filteredMatches.players.length; i++) {
                const player = filteredMatches.players[i];
                if (player.profile_id !== parseInt(streamerProfileId)) {
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
        const urlRatingHistory = `https://aoe2.net/api/player/ratinghistory?game=aoe2de&leaderboard_id=3&profile_id=${profileId}&count=1000`;
        const urlMatches = `https://aoe2.net/api/player/matches?game=aoe2de&count=100&profile_id=${profileId}`;

        const regexPlayerName = /.*(?=\s\(\d+\))/;
        const regexPlayerElo = /\d+(?=\))/;
        const regexPlayerWinrate = /\d+%/;
        const regexPlayerTotalGames = /(\d{1,3},)*(\d+)(?=\sgames)/;

        const [playerStatus, ratingHistory, matches, stringsLookup] = await Promise.all([
            $.ajax({ url: corsProxyUrl + encodeURIComponent(urlPlayerStatus) }),
            $.getJSON(corsProxyUrl + encodeURIComponent(urlRatingHistory)),
            $.getJSON(corsProxyUrl + encodeURIComponent(urlMatches)),
            $.getJSON(stringsLookupPath)
        ]);
        const playerName = playerStatus.match(regexPlayerName)[0];
        const playerCurrentElo = playerStatus.match(regexPlayerElo)[0];
        const playerTotalGames = playerStatus.match(regexPlayerTotalGames)[0];
        const playerWinrate = playerStatus.match(regexPlayerWinrate)[0];
        const ratings = ratingHistory.map(entry => entry.rating);
        const playerMaxElo = Math.max(...ratings);
        var lastPlayerColor;

        // Number of last used civs configured here.
        const filteredMatches = matches.filter(match => match.leaderboard_id === 3).slice(0, 7);
        const lastUsedCivs = [];

        for (let i = 0; i < filteredMatches.length; i++) {
            const player = filteredMatches[i].players.find(p => p.profile_id == profileId);
            const opponent = filteredMatches[i].players.find(p => p.profile_id != profileId);
            if (i == 0) {
                lastPlayerColor = player.color;
                lastOpponentColor = opponent.color;
            }
            const civCode = player.civ;
            const civString = stringsLookup.civ.find(c => c.id === civCode).string;
            lastUsedCivs.push(civString.toLowerCase());
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

    function setTextShadow(playerNameId, colorCode) {
        $.getJSON(stringsLookupPath, function (stringsLookup) {
            const playerColor = stringsLookup.color.find(c => c.id === colorCode).string.toLowerCase();
            document.getElementById(playerNameId).style.color = playerColor;

            const lightColors = [3, 4, 5, 8];
            if (lightColors.includes(colorCode)) {
                document.getElementById(playerNameId).style.textShadow = "0px 0px 6.18px white";
                return;
            }
            document.getElementById(playerNameId).style.textShadow = "0.618px 0.618px 3px white, -0.618px -0.618px 3px white, 0px 0px 6.18px white";
        });
    }
}

// Actual execution happens here.
main();
