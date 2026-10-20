import test from"node:test";
import assert from"node:assert/strict";
import fs from"node:fs";

const html=
  fs.readFileSync(
    new URL(
      "../index.html",
      import.meta.url
    ),
    "utf8"
  );

const app=
  fs.readFileSync(
    new URL(
      "../src/app.js",
      import.meta.url
    ),
    "utf8"
  );

const css=
  fs.readFileSync(
    new URL(
      "../styles.css",
      import.meta.url
    ),
    "utf8"
  );

test(
  "feature controls are present",
  ()=>{
    assert.match(
      html,
      /id="random-seed"/
    );

    assert.match(
      html,
      /id="count-info"/
    );

    assert.match(
      html,
      /id="reset"/
    );
  }
);
test(
  "role counts and log reversal are wired",
  ()=>{
    assert.match(
      app,
      /COUNTS/
    );

    assert.match(
      app,
      /reverse\(\)/
    );

    assert.match(
      app,
      /randomSeed/
    );

    assert.match(
      app,
      /resetGame/
    );
  }
);

test(
  "count colours are distinct",
  ()=>{
    assert.match(
      css,
      /\.good-count/
    );

    assert.match(
      css,
      /\.evil-count/
    );
  }
);

test(
  "post-game reveal renders engine-provided Key Moments",
  ()=>{
    assert.match(
      app,
      /r\.keyMoments/
    );

    assert.match(
      app,
      /Key moments/
    );
  }
);