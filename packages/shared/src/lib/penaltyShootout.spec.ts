import {
  extractPenaltyShootoutKicks,
  isPenaltyShootoutKickEvent,
  penaltyShootoutTeamSummaries,
} from "./penaltyShootout";

describe("penaltyShootout", () => {
  it("detects explicit shootout goals", () => {
    const events = [
      {
        team: "home",
        type: "Goal",
        detail: "Penalty Shootout Goal",
        time: 120,
        timeExtra: 1,
        player: { name: "Depay" },
      },
      {
        team: "away",
        type: "Goal",
        detail: "Penalty Shootout Goal",
        time: 120,
        timeExtra: 2,
        player: { name: "Hakimi" },
      },
    ];
    const kicks = extractPenaltyShootoutKicks(events, { wentToPenalties: true });
    expect(kicks).toHaveLength(2);
    expect(kicks[0]?.playerName).toBe("Depay");
    expect(kicks[1]?.playerName).toBe("Hakimi");
  });

  it("excludes extra-time spot-kick winners at 120+", () => {
    const e = {
      team: "home",
      type: "Goal",
      detail: "Penalty",
      time: 120,
      timeExtra: 5,
      player: { name: "Tielemans" },
    };
    expect(isPenaltyShootoutKickEvent(e)).toBe(false);
    const kicks = extractPenaltyShootoutKicks([e], { wentToPenalties: false });
    expect(kicks).toHaveLength(0);
  });

  it("includes missed penalties only when API confirms a shootout", () => {
    const e = {
      team: "away",
      type: "Goal",
      detail: "Missed Penalty Shootout",
      time: 121,
      timeExtra: null,
      player: { name: "Ziyech" },
    };
    expect(isPenaltyShootoutKickEvent(e)).toBe(true);
    const kicks = extractPenaltyShootoutKicks([e], { wentToPenalties: true });
    expect(kicks[0]?.scored).toBe(false);
  });

  it("excludes regulation missed penalties", () => {
    const e = {
      team: "home",
      type: "Goal",
      detail: "Missed Penalty",
      time: 34,
      timeExtra: null,
      player: { name: "Rashford" },
    };
    expect(isPenaltyShootoutKickEvent(e)).toBe(false);
  });

  it("groups scored and missed by team", () => {
    const { home, away } = penaltyShootoutTeamSummaries([
      { team: "home", playerName: "Depay", scored: true },
      { team: "away", playerName: "Ziyech", scored: false },
    ]);
    expect(home.scored).toEqual(["Depay"]);
    expect(away.missed).toEqual(["Ziyech"]);
  });
});
