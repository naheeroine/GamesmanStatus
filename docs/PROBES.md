# Probes (Locked for v1)

## Universal API Root — `api-root`
- URL: https://nyc.cs.berkeley.edu/universal/v1/  
- Type: JSON  
- Component/Group: API / Core  
- SLA p95: 800 ms  
- Assertions:  
  - HTTP 200  
  - Body is JSON array (length ≥ 20)  
  - First element has keys `id`, `name`

## Homepage — `homepage`
- URL: https://nyc.cs.berkeley.edu/uni/  
- Type: HTML  
- Component/Group: Frontend / Core  
- SLA p95: 1500 ms  
- Assertions:  
  - HTTP 200  
  - HTML contains “GamesmanUni” or the JS-required banner string

## Game JSON (Tic-Tac-Toe start) — `game-ttt`
- URL: https://nyc.cs.berkeley.edu/universal/v1/tictactoe/regular/positions/?p=1_---------  
- Type: JSON  
- Component/Group: API / Games  
- SLA p95: 800 ms  
- Assertions:  
  - HTTP 200  
  - JSON has `position`, `positionValue`, `remoteness`  
  - `moves` exists and is a non-empty array  
  - First move object has `move`, `position`, `moveValue`, `remoteness`

## Puzzle JSON (Hanoi 3_3 position) — `puzzle-hanoi`
- URL: https://nyc.cs.berkeley.edu/universal/v1/towersofhanoi/3_3/positions/?p=A--B--C--  
- Type: JSON  
- Component/Group: API / Puzzles  
- SLA p95: 800 ms  
- Assertions:  
  - HTTP 200  
  - JSON has `position`, `positionValue`, `remoteness`  
  - `moves` exists and is a non-empty array  
  - First move object has `move`, `position`, `moveValue`, `remoteness`
