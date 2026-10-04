// JEV AI System - System One Fast Structured Decision Architecture
// Modeled after TypeSafe AI's Jev (Fast, typed evaluations in <1ms)

export class JEVEngine {
  constructor() {
    this.decisionHistory = [];
  }

  // Fast single-pass evaluation of entity state vector
  evaluate(entity, worldContext) {
    const personality = entity.personality || {
      openness: 0.5,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      neuroticism: 0.5,
      piety: 0.8
    };

    const proficiencies = entity.proficiencies || {
      architecture: 50,
      warfare: 50,
      statesmanship: 50,
      farming: 50,
      science: 50,
      mysticism: 50
    };

    const needs = entity.needs || { hunger: 10, energy: 90, safety: 80 };
    const civ = entity.civilization;
    const tile = worldContext.terrain.getTile(Math.floor(entity.x), Math.floor(entity.y));

    // --- 1. JEV "CHOICE" EVALUATION ---
    // Generate context-sensitive candidate action pool
    const candidates = [];

    // Divine communion
    candidates.push({
      action: 'CommuneWithGod',
      score: personality.piety * 1.5 + (proficiencies.mysticism / 100) * 0.8,
      reason: 'Yearning to receive the Creator’s divine whisper'
    });

    // Architecture / Building
    if (civ && (!tile.structure || tile.structure.type === 'ruins')) {
      candidates.push({
        action: 'ErectHolySanctuary',
        score: personality.conscientiousness * 1.2 + (proficiencies.architecture / 100) * 1.4,
        reason: 'Inspired to build an enduring monument to the Gods'
      });
    }

    // Warfare & Defense
    if (worldContext.threatsNear || personality.agreeableness < 0.3) {
      candidates.push({
        action: 'RallyHolyWarriors',
        score: (1 - personality.agreeableness) * 1.3 + (proficiencies.warfare / 100) * 1.2,
        reason: 'Seeking conquest and defending the sacred borders'
      });
    }

    // Philosophy & Science
    if (personality.openness > 0.6) {
      candidates.push({
        action: 'PonderCosmicMysteries',
        score: personality.openness * 1.4 + (proficiencies.science / 100) * 1.1,
        reason: 'Contemplating celestial movements and inventing new tools'
      });
    }

    // Leadership & Faith Proclamation
    if (personality.extraversion > 0.5) {
      candidates.push({
        action: 'ProclaimDivineProphecy',
        score: personality.extraversion * 1.2 + personality.piety * 1.1 + (proficiencies.statesmanship / 100),
        reason: 'Preaching the Creator’s glory to gather devoted followers'
      });
    }

    // Agriculture & Abundance
    if (needs.hunger > 40 || proficiencies.farming > 60) {
      candidates.push({
        action: 'BlessCropsAndFertility',
        score: (proficiencies.farming / 100) * 1.3 + (needs.hunger / 100),
        reason: 'Nurturing the land for a grand harvest'
      });
    }

    // Sort candidates to find highest scoring JEV Choice
    candidates.sort((a, b) => b.score - a.score);
    const chosen = candidates[0] || {
      action: 'ContemplateExistence',
      score: 0.5,
      reason: 'Watching the stars drift across the cosmic sky'
    };

    // --- 2. JEV "SCORE" (Continuous rubric ratings [0.0 - 1.0]) ---
    const pietyScore = Math.min(1.0, personality.piety * 0.9 + (proficiencies.mysticism / 200));
    const heroismScore = Math.min(1.0, (1 - personality.neuroticism) * 0.5 + (proficiencies.warfare / 150));
    const leadershipScore = Math.min(1.0, personality.extraversion * 0.6 + (proficiencies.statesmanship / 160));

    // --- 3. JEV "NOUL" (Deterministic Boolean Judgments) ---
    const noulDecisions = {
      willDefyMortalKing: personality.piety > 0.7 && personality.agreeableness < 0.4,
      readyForSelfSacrifice: personality.agreeableness > 0.7 && personality.piety > 0.65,
      hasReceivedDivineVision: personality.piety > 0.85 || proficiencies.mysticism > 75,
      willLeadGoldenAge: leadershipScore > 0.75 && personality.conscientiousness > 0.6
    };

    // Formulate structured thought log
    const thoughtLog = `${chosen.reason}. [JEV Action: ${chosen.action}]`;

    const decision = {
      timestamp: Date.now(),
      action: chosen.action,
      reason: chosen.reason,
      thoughtLog,
      scores: {
        piety: parseFloat(pietyScore.toFixed(2)),
        heroism: parseFloat(heroismScore.toFixed(2)),
        leadership: parseFloat(leadershipScore.toFixed(2))
      },
      noul: noulDecisions
    };

    this.decisionHistory.unshift(decision);
    if (this.decisionHistory.length > 25) this.decisionHistory.pop();

    return decision;
  }
}

export const jevEngine = new JEVEngine();
