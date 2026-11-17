// The planner's data files, bundled with the app. Town-level aggregates only.
import towns from '../../data/towns.json';
import sfd from '../../data/sfd.json';
import wfd from '../../data/wfd.json';
import rules from '../../data/rules.json';
import costs from '../../data/costs.json';
import params from '../../data/params.json';
import benchmarks from '../../data/benchmarks.json';
import pubindex from '../../data/pubindex.json';
import sizing from '../../data/sizing.json';
import unitCosts from '../../data/unit_costs.json';
import places from '../../data/places.json';
import strings from '../../data/strings.en.json';
import { makeT } from '../../js/model/format.js';
import { systemIndex } from '../../js/engine/sfd.js';

export const d = { towns, sfd, wfd, rules, costs, params, benchmarks, pubindex, sizing, unit_costs: unitCosts, places };
export const t = makeT(strings);
export const sysIdx = systemIndex(rules);
export const today = new Date().toISOString().slice(0, 10);
