import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { computeTimeEfficiency, computeLeaderboard } = require('../server/job-card-scoring.cjs');

test('time efficiency is 1.0 when actual matches expected', () => {
  assert.equal(computeTimeEfficiency(240, 240), 1);
});

test('time efficiency is capped at 1.0 when finishing early', () => {
  assert.equal(computeTimeEfficiency(240, 120), 1);
});

test('time efficiency drops below 1.0 when running over', () => {
  assert.equal(computeTimeEfficiency(240, 480), 0.5);
});

test('time efficiency is null when inputs are missing or invalid', () => {
  assert.equal(computeTimeEfficiency(null, 120), null);
  assert.equal(computeTimeEfficiency(240, null), null);
  assert.equal(computeTimeEfficiency(240, 0), null);
});

test('leaderboard credits both technicians on a 2-person job', () => {
  const jobs = [
    {
      assigned_employee_id: 'emp-1', assigned_employee_name: 'Amit',
      secondary_employee_id: 'emp-2', secondary_employee_name: 'Rohan',
      feedback_rating: 5, expected_time_minutes: 240, actual_minutes: 240,
    },
  ];
  const board = computeLeaderboard(jobs);
  assert.equal(board.length, 2);
  const amit = board.find(r => r.employeeId === 'emp-1');
  const rohan = board.find(r => r.employeeId === 'emp-2');
  assert.equal(amit.jobsCount, 1);
  assert.equal(rohan.jobsCount, 1);
  assert.equal(amit.avgRating, 5);
  assert.equal(amit.avgTimeEfficiency, 1);
});

test('leaderboard averages across multiple jobs and sorts by combined score descending', () => {
  const jobs = [
    { assigned_employee_id: 'emp-1', assigned_employee_name: 'Amit', secondary_employee_id: null, secondary_employee_name: null, feedback_rating: 5, expected_time_minutes: 240, actual_minutes: 240 },
    { assigned_employee_id: 'emp-1', assigned_employee_name: 'Amit', secondary_employee_id: null, secondary_employee_name: null, feedback_rating: 3, expected_time_minutes: 240, actual_minutes: 480 },
    { assigned_employee_id: 'emp-2', assigned_employee_name: 'Sunil', secondary_employee_id: null, secondary_employee_name: null, feedback_rating: 4, expected_time_minutes: 240, actual_minutes: 240 },
  ];
  const board = computeLeaderboard(jobs);
  assert.equal(board[0].employeeId, 'emp-2'); // Sunil: rating 4, efficiency 1.0 -> beats Amit's average
  assert.equal(board.length, 2);
  const amit = board.find(r => r.employeeId === 'emp-1');
  assert.equal(amit.jobsCount, 2);
  assert.equal(amit.avgRating, 4); // (5+3)/2
  assert.equal(amit.avgTimeEfficiency, 0.75); // (1.0 + 0.5) / 2
});

test('leaderboard skips jobs with no rating for the rating average but still counts time efficiency', () => {
  const jobs = [
    { assigned_employee_id: 'emp-1', assigned_employee_name: 'Amit', secondary_employee_id: null, secondary_employee_name: null, feedback_rating: null, expected_time_minutes: 240, actual_minutes: 240 },
  ];
  const board = computeLeaderboard(jobs);
  assert.equal(board[0].avgRating, null);
  assert.equal(board[0].avgTimeEfficiency, 1);
});
