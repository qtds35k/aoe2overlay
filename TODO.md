# Track 1: Restore AOE2 Overlay + Add Unit Tests

## Context
Static HTML/JS/CSS overlay at https://github.com/qtds35k/aoe2overlay (no build system, no package.json).
The aoe2.net API it depends on is dead. Replace all dead endpoints with aoe2companion equivalents.
Then add a Jest test suite for all pure logic in js/index.js.

## Repo structure
- js/index.js       ← all app logic, 208 lines
- css/index.css
- index.html
- resource/strings.json   ← civ + color lookup tables

---

## Step 1 — Replace dead API URLs in js/index.js

There are 3 dead endpoints. Replace as follows:

### 1a. getOpponentProfileId (line ~110)
OLD:
```js
const urlMatches = 'https://aoe2.net/api/player/matches?game=aoe2de&count=50&profile_id=' + profileId;
```
NEW:
```js
const urlMatches = 'https://legacy.aoe2companion.com/api/player/matches?game=aoe2de&count=50&profile_id=' + profileId;
```

### 1b. getPlayerStats — three URLs (lines ~132-134)
OLD:
```js
const urlPlayerStatus = `https://aoe2.net/api/nightbot/rank?game=aoe2de&leaderboard_id=3&profile_id=${profileId}&flag=false`;
const urlRatingHistory = `https://aoe2.net/api/player/ratinghistory?game=aoe2de&leaderboard_id=3&profile_id=${profileId}&count=1000`;
const urlMatches = `https://aoe2.net/api/player/matches?game=aoe2de&count=100&profile_id=${profileId}`;
```
NEW:
```js
const urlPlayerStatus = `https://data.aoe2companion.com/api/nightbot/rank?game=aoe2de&leaderboard_id=3&profile_id=${profileId}&flag=false`;
const urlRatingHistory = `https://legacy.aoe2companion.com/api/player/ratinghistory?game=aoe2de&leaderboard_id=3&profile_id=${profileId}&count=1000`;
const urlMatches = `https://legacy.aoe2companion.com/api/player/matches?game=aoe2de&count=100&profile_id=${profileId}`;
```

The CORS proxy (`api.allorigins.win`) stays unchanged — it is still needed since this is a browser page on GitHub Pages.

---

## Step 2 — Set up Jest

Create `package.json` in repo root:
```json
{
  "name": "aoe2overlay",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "jest"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "jest-environment-jsdom": "^29.0.0"
  },
  "jest": {
    "testEnvironment": "jsdom"
  }
}
```

Run: `npm install`

Create directory: `tests/`

---

## Step 3 — Extract pure logic from js/index.js into js/utils.js

The regex parsing and civ-lookup logic is currently inline inside `main()`. Extract it so it can be imported and tested.

Create `js/utils.js`:
```js
const REGEX_PLAYER_NAME = /.*(?=\s\(\d+\))/;
const REGEX_PLAYER_ELO = /\d+(?=\))/;
const REGEX_PLAYER_WINRATE = /\d+%/;
const REGEX_PLAYER_TOTAL_GAMES = /(\d{1,3},)*(\d+)(?=\sgames)/;
const LIGHT_COLOR_IDS = [3, 4, 5, 8];

function parseNightbotResponse(text) {
    return {
        playerName: text.match(REGEX_PLAYER_NAME)?.[0] ?? "???",
        playerCurrentElo: text.match(REGEX_PLAYER_ELO)?.[0] ?? "???",
        playerTotalGames: text.match(REGEX_PLAYER_TOTAL_GAMES)?.[0] ?? "???",
        playerWinrate: text.match(REGEX_PLAYER_WINRATE)?.[0] ?? "???",
    };
}

function getMaxElo(ratingHistory) {
    if (!ratingHistory || ratingHistory.length === 0) return "???";
    return Math.max(...ratingHistory.map(entry => entry.rating));
}

function getLastUsedCivs(matches, profileId, stringsLookup, any1v1, limit = 7) {
    const filtered = any1v1
        ? matches.filter(m => m.num_players === 2).slice(0, limit)
        : matches.filter(m => m.leaderboard_id === 3).slice(0, limit);

    return filtered.map(match => {
        const player = match.players.find(p => p.profile_id == profileId);
        const civCode = player.civ;
        return stringsLookup.civ.find(c => c.id === civCode).string.toLowerCase();
    });
}

function getOpponentFromMatch(match, streamerProfileId) {
    return match.players.find(p => p.profile_id !== parseInt(streamerProfileId));
}

function isLightColor(colorId) {
    return LIGHT_COLOR_IDS.includes(colorId);
}

if (typeof module !== 'undefined') {
    module.exports = { parseNightbotResponse, getMaxElo, getLastUsedCivs, getOpponentFromMatch, isLightColor };
}
```

In `js/index.js`, add at the top (before `main()`):
```js
// Load utils when running in browser (Jest imports directly via require)
if (typeof require !== 'undefined' && typeof module !== 'undefined') {
    // running in Node/Jest — utils loaded via require in test files
} else {
    // running in browser — utils are loaded via <script> tag
}
```

In `index.html`, add before `js/index.js`:
```html
<script src="js/utils.js"></script>
```

Replace the inline regex/logic in `index.js` `getPlayerStats()` with calls to the utils functions.

---

## Step 4 — Write tests

Create `tests/utils.test.js`:

```js
const { parseNightbotResponse, getMaxElo, getLastUsedCivs, getOpponentFromMatch, isLightColor } = require('../js/utils');

// --- parseNightbotResponse ---

describe('parseNightbotResponse', () => {
    test('parses a well-formed nightbot response', () => {
        const input = 'TheViper (2100) | Wins: 500 Losses: 200 | 71% (700 games)';
        const result = parseNightbotResponse(input);
        expect(result.playerName).toBe('TheViper');
        expect(result.playerCurrentElo).toBe('2100');
        expect(result.playerWinrate).toBe('71%');
        expect(result.playerTotalGames).toBe('700');
    });

    test('handles player names with spaces', () => {
        const input = 'Mr Yo (1850) | Wins: 300 Losses: 150 | 67% (450 games)';
        expect(parseNightbotResponse(input).playerName).toBe('Mr Yo');
    });

    test('handles large game counts with commas', () => {
        const input = 'Hera (2200) | Wins: 1200 Losses: 800 | 60% (2,000 games)';
        expect(parseNightbotResponse(input).playerTotalGames).toBe('2,000');
    });

    test('returns ??? for malformed input', () => {
        const result = parseNightbotResponse('');
        expect(result.playerName).toBe('???');
        expect(result.playerCurrentElo).toBe('???');
        expect(result.playerWinrate).toBe('???');
        expect(result.playerTotalGames).toBe('???');
    });
});

// --- getMaxElo ---

describe('getMaxElo', () => {
    test('returns the highest rating', () => {
        const history = [{ rating: 1800 }, { rating: 2100 }, { rating: 1950 }];
        expect(getMaxElo(history)).toBe(2100);
    });

    test('returns ??? for empty array', () => {
        expect(getMaxElo([])).toBe('???');
    });

    test('returns ??? for null', () => {
        expect(getMaxElo(null)).toBe('???');
    });
});

// --- getOpponentFromMatch ---

describe('getOpponentFromMatch', () => {
    const match = {
        players: [
            { profile_id: 123, name: 'Streamer' },
            { profile_id: 456, name: 'Opponent' },
        ]
    };

    test('returns the player that is not the streamer', () => {
        expect(getOpponentFromMatch(match, '123').name).toBe('Opponent');
    });

    test('handles streamer as second player', () => {
        expect(getOpponentFromMatch(match, '456').name).toBe('Streamer');
    });
});

// --- getLastUsedCivs ---

describe('getLastUsedCivs', () => {
    const stringsLookup = {
        civ: [
            { id: 1, string: 'Britons' },
            { id: 5, string: 'Franks' },
            { id: 10, string: 'Mongols' },
        ]
    };

    const makeMatch = (leaderboard_id, num_players, profileId, civId) => ({
        leaderboard_id,
        num_players,
        players: [
            { profile_id: profileId, civ: civId },
            { profile_id: 999, civ: 1 },
        ]
    });

    test('extracts civs from ranked 1v1 matches', () => {
        const matches = [
            makeMatch(3, 2, 123, 5),
            makeMatch(3, 2, 123, 10),
            makeMatch(0, 2, 123, 1),  // unranked, should be excluded
        ];
        const civs = getLastUsedCivs(matches, 123, stringsLookup, false);
        expect(civs).toEqual(['franks', 'mongols']);
    });

    test('respects limit', () => {
        const matches = Array(10).fill(null).map(() => makeMatch(3, 2, 123, 1));
        expect(getLastUsedCivs(matches, 123, stringsLookup, false, 3)).toHaveLength(3);
    });

    test('uses any1v1 filter when flag is set', () => {
        const matches = [
            makeMatch(0, 2, 123, 5),   // unranked 1v1 — should be included
            makeMatch(3, 2, 123, 10),  // ranked 1v1 — also included
            makeMatch(3, 4, 123, 1),   // team game — excluded
        ];
        const civs = getLastUsedCivs(matches, 123, stringsLookup, true);
        expect(civs).toHaveLength(2);
    });
});

// --- isLightColor ---

describe('isLightColor', () => {
    test('identifies light color IDs', () => {
        expect(isLightColor(3)).toBe(true);
        expect(isLightColor(4)).toBe(true);
        expect(isLightColor(5)).toBe(true);
        expect(isLightColor(8)).toBe(true);
    });

    test('identifies dark color IDs', () => {
        expect(isLightColor(1)).toBe(false);
        expect(isLightColor(2)).toBe(false);
        expect(isLightColor(7)).toBe(false);
    });
});
```

---

## Step 5 — Add .gitignore entry
Append to .gitignore:
```
node_modules/
```

---

## Acceptance criteria
- `npm test` runs and all tests pass
- Opening index.html with `?profileId=<any_valid_id>` in a browser renders player stats
- No references to `aoe2.net` remain in js/

---

## Implementation summary

This TODO is effectively implemented in the current repo state.

- `js/index.js` no longer uses `aoe2.net`; it uses AoE2 Companion endpoints through the existing `api.allorigins.win` proxy.
- The match/profile examples in this TODO that point at `legacy.aoe2companion.com` were partially stale, so the implementation uses the current live `data.aoe2companion.com` endpoints instead of copying dead URLs verbatim.
- Pure logic was extracted into `js/utils.js` and loaded before `js/index.js` from `index.html`.
- Jest was added with `package.json`, `tests/utils.test.js`, and the `node_modules/` ignore rule.
- The current test suite covers the extracted parsing, match filtering, player lookup, civ lookup, and color logic, including the newer AoE2 Companion `teams[].players[]` match shape.
- `npm test` passes with 28 tests.
- The remaining live-data bug in `getOpponentProfileId()` was fixed so current AoE2 Companion match payloads resolve the opponent correctly.
- `README.md` usage notes were updated so they no longer send users to dead `aoe2.net` pages.

Manual browser smoke testing of `index.html?profileId=<id>` was not performed in this session.

