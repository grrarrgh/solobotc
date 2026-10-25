import { name, team } from "../data.js";
import { pick, sample, shuffle, claimHeard, whose } from "../util.js";
import {
  isMinion,
  steer,
  killHelps,
  nameable,
  framed,
  oneOf,
} from "../storyteller.js";

// The team each "one of these two players is X" character learns about.
export const PAIR_TEAM = {
  washerwoman: "townsfolk",
  librarian: "outsider",
  investigator: "minion",
};

// The information of a "one of these two players is X" character (the
// Washerwoman, Librarian and Investigator), which differ only in the team
// they learn about (PAIR_TEAM) and in how their lies help the evil team.
// See each character's own module.
export const pairInfo = (role) => {
  const wanted = PAIR_TEAM[role];

  return {
    truth(s, p) {
      const real = pick(
        nameable(s, p).filter(
          (x) => team(x.role) === wanted || (wanted === "minion" && isMinion(x)),
        ),
        s.r,
      );

      if (!real) {
        return { targets: [], text: "No matching character is in play." };
      }

      // The other player: for an Investigator, an evil one helps good (and a
      // good one helps evil); for a Washerwoman or Librarian, the reverse.
      const fake = pick(
        steer(
          s,
          nameable(s, p).filter((x) => x.id !== real.id),
          (x) =>
            role === "investigator" ? killHelps(x) : x.alignment,
          `the other player ${whose(p)} ${name(role)} sees`,
        ),
        s.r,
      );

      return {
        targets: [real.id, fake.id],
        text: oneOf(real, fake, real.role),
      };
    },

    lie(s, p, strat, helpEvil = false) {
      const shown = pick(
        s.script.ids.filter((id) => team(id) === wanted),
        s.r,
      );

      // Neither named player holds the character; frame good players if
      // possible. An evil Investigator names the team's scapegoat as one of
      // the two "Minions".
      const others = nameable(s, p).filter((x) => x.role !== shown);
      const good = others.filter((x) => x.alignment === "good");
      const pool = good.length >= 2 ? good : others;
      const goat = role === "investigator" ? framed(s, p) : null;
      const mate =
        goat &&
        pool.includes(goat) &&
        pick(
          pool.filter((x) => x !== goat),
          s.r,
        );

      // A Washerwoman's "Townsfolk" pair gives an evil player cover (and, when
      // it must help evil, a Librarian's "Outsider" pair).
      const shield =
        (role === "washerwoman" || (helpEvil && role === "librarian")) &&
        pick(
          others.filter((x) => x.alignment === "evil"),
          s.r,
        );
      const cover =
        shield &&
        pick(
          good.filter((x) => x !== shield),
          s.r,
        );
      const pair = mate
        ? shuffle([goat, mate], s.r)
        : cover
          ? shuffle([shield, cover], s.r)
          : sample(pool, 2, s.r);
      // (Vouching for the shield as the Townsfolk they claim, so their story
      // holds up, rather than a character neither claims.)
      // (Or, if the shield claims something else, the other player's claim:
      // the shield is then just the other one of the pair. With a random pair
      // holding a teammate, as with Legion, the same.)
      const vouchFor = cover ? [shield, cover] : pair.some((x) => x.alignment === "evil") ? pair : [];
      const said = vouchFor
        .map((x) => claimHeard(x, p))
        .find((x) => x && team(x) === wanted);
      const vouched = said && p.alignment === "evil" ? said : shown;

      return vouched && pair.length === 2
        ? {
            targets: pair.map((x) => x.id),
            text: oneOf(pair[0], pair[1], vouched),
          }
        : shown && pair.length === 2
        ? {
            targets: pair.map((x) => x.id),
            text: oneOf(pair[0], pair[1], shown),
          }
        : { targets: [], text: "No matching character is in play." };
    },

    random(s, p) {
      const pair = sample(
        s.players.filter((x) => x.id !== p.id),
        2,
        s.r,
      );
      const possible = s.script.ids.filter((id) => team(id) === wanted);
      const shown = pick(possible, s.r);

      return {
        targets: pair.map((x) => x.id),
        text:
          shown && pair.length === 2
            ? oneOf(pair[0], pair[1], shown)
            : "No matching character is in play.",
      };
    },
  };
};
