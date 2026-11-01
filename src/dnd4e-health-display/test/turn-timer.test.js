import assert from "node:assert/strict";
import test from "node:test";
import { TurnTimer, PauseRegistry } from "../scripts/compact-tracker/turn-timer.js";

test("the timer counts up while a turn runs and restarts when the turn changes", () => {
	const timer = new TurnTimer();
	assert.deepEqual(timer.update("turn-1", null, 1000), { elapsedMs: 0, pausedBy: null });
	assert.equal(timer.update("turn-1", null, 4000).elapsedMs, 3000);
	assert.equal(timer.update("turn-1", null, 5500).elapsedMs, 4500);
	assert.equal(timer.update("turn-2", null, 6000).elapsedMs, 0, "a new turn restarts");
	assert.equal(timer.update("turn-2", null, 7000).elapsedMs, 1000);
});

test("pausing freezes the time and resuming continues from it without counting the pause", () => {
	const timer = new TurnTimer();
	timer.update("turn", null, 0);
	timer.update("turn", null, 10000);
	assert.deepEqual(timer.update("turn", "Target Automation", 20000), { elapsedMs: 10000, pausedBy: "Target Automation" });
	assert.equal(timer.update("turn", "Target Automation", 90000).elapsedMs, 10000);
	assert.equal(timer.update("turn", null, 95000).elapsedMs, 15000, "only the five running seconds are added");
});

test("with no turn there is nothing to count or pause", () => {
	const timer = new TurnTimer();
	assert.deepEqual(timer.update(null, "Dice So Nice", 1000), { elapsedMs: 0, pausedBy: null });
	assert.equal(timer.update(null, null, 9000).elapsedMs, 0);
});

test("a clock that moves backwards never subtracts time", () => {
	const timer = new TurnTimer();
	timer.update("t", null, 10000);
	assert.equal(timer.update("t", null, 9000).elapsedMs, 0);
});

test("Target Automation freezes the timer only for the acting token", () => {
	const pauses = new PauseRegistry();
	pauses.setTargeting("u1", true, "Scene.s.Token.kessa");
	assert.equal(pauses.reason("Scene.s.Token.kessa", 0), "Target Automation");
	assert.equal(pauses.reason("Scene.s.Token.mirelle", 0), null, "a reaction by someone else does not stop another turn");
	pauses.setTargeting("u1", false);
	assert.equal(pauses.reason("Scene.s.Token.kessa", 0), null);
});

test("a session with no known token still pauses, rather than risk counting through targeting", () => {
	const pauses = new PauseRegistry();
	pauses.setTargeting("u1", true, null);
	assert.equal(pauses.reason("Scene.s.Token.kessa", 0), "Target Automation");
});

test("Dice So Nice freezes the timer while any animation is running", () => {
	const pauses = new PauseRegistry();
	pauses.setDice("m1", true, 1000);
	pauses.setDice("m2", true, 1500);
	assert.equal(pauses.reason("t", 2000), "Dice So Nice");
	pauses.setDice("m1", false, 2500);
	assert.equal(pauses.reason("t", 2600), "Dice So Nice", "still waiting on the second roll");
	pauses.setDice("m2", false, 2700);
	assert.equal(pauses.reason("t", 2800), null);
});

test("Target Automation takes precedence over Dice So Nice", () => {
	const pauses = new PauseRegistry();
	pauses.setDice("m1", true, 0);
	pauses.setTargeting("u1", true, "tok");
	assert.equal(pauses.reason("tok", 10), "Target Automation");
	pauses.setTargeting("u1", false);
	assert.equal(pauses.reason("tok", 10), "Dice So Nice");
});

test("an animation that never completes cannot freeze the timer forever", () => {
	const pauses = new PauseRegistry();
	pauses.setDice("stuck", true, 0);
	assert.equal(pauses.reason("t", 19999), "Dice So Nice");
	assert.equal(pauses.reason("t", 20001), null);
});

test("a disconnected user's session is forgotten", () => {
	const pauses = new PauseRegistry();
	pauses.setTargeting("u1", true, "tok");
	pauses.setTargeting("u2", true, "other");
	pauses.clearUser("u1");
	assert.equal(pauses.reason("tok", 0), null);
	assert.equal(pauses.reason("other", 0), "Target Automation");
});
