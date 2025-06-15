import { CARD_STATUS } from './Card.js';
import { isTrash } from './hanabi-util.js';

/**
 * @typedef {import('./Game.js').Game} Game
 * @typedef {import('./State.js').State} State
 * @typedef {import('./Player.js').Player} Player
 * @typedef {import('../types.js').Identity} Identity
 * @typedef {import('../types.js').Clue} Clue
 */

/**
 * @param  {State} state
 * @param  {Player} player
 * @param  {Player} hypo_player
 * @param  {number[]} hand
 * @param  {number[]} list
 */
export function elim_result(state, player, hypo_player, hand, list) {
	const new_touched = [];
	let fill = 0, elim = 0;

	for (const order of hand) {
		const old_card = player.thoughts[order];
		const hypo_card = hypo_player.thoughts[order];

		if (hypo_card.clued && hypo_card.status !== CARD_STATUS.CALLED_TO_DC && hypo_card.possible.length < old_card.possible.length) {
			if (hypo_card.newly_clued && !old_card.blind_playing)
				new_touched.push(hypo_card);
			else if (list.includes(order) && state.hasConsistentInferences(hypo_card))
				fill++;
			else if (state.hasConsistentInferences(hypo_card))
				elim++;
		}
	}
	return { new_touched, fill, elim };
}

/**
 * @param  {Game} game
 * @param  {Game} hypo_game
 * @param  {Player} hypo_player
 * @param  {number} giver
 * @param  {number} target
 */
export function bad_touch_result(game, hypo_game, hypo_player, giver, target) {
	const { state } = hypo_game;

	const dupe_scores = game.players.map((player, pi) => {
		if (pi == target)
			return Infinity;

		// Check if the giver may have a touched duplicate card.
		return state.hands[target].reduce((acc, order) => {
			const card = state.deck[order];
			if (!card.newly_clued)
				return acc;

			const identity = card.identity();
			// TODO: Should we cluing cards where receiver knows they are duplicated?
			if (!identity || state.isBasicTrash(identity))
				return acc;

			// Allow known duplication since we can discard to resolve it.
			acc += state.hands[pi].filter(o => ((c = player.thoughts[o]) =>
				c.clued && c.inferred.length > 1 && c.inferred.has(identity))()).length;
			return acc;
		}, 0);
	});

	const min_dupe = Math.min(...dupe_scores);
	const avoidable_dupe = dupe_scores[giver] - min_dupe;

	const bad_touch = [], cm_dupe = [], trash = [];

	for (const order of state.hands[target]) {
		const card = state.deck[order];
		// Ignore cards that aren't newly clued
		if (!card.newly_clued)
			continue;

		// Known trash from empathy
		if (hypo_player.thoughts[order].possible.every(p => isTrash(state, hypo_player, p, order, { infer: true }))) {
			trash.push(order);
			continue;
		}

		if (state.isBasicTrash(card)) {
			bad_touch.push(order);
			continue;
		}

		if (state.hands.flat().some(o => hypo_player.thoughts[o].status === CARD_STATUS.CM && !hypo_player.thoughts[o].clued && o !== order && state.deck[o].matches(card))) {
			cm_dupe.push(order);
			continue;
		}
	}

	for (const order of state.hands[target]) {
		const card = state.deck[order];

		if (!card.newly_clued || bad_touch.includes(order) || trash.includes(order) || cm_dupe.includes(order))
			continue;

		const duplicates = state.hands.flatMap((hand, i) => hand.filter(o =>
			((c = hypo_game.me.thoughts[o]) =>  {
				// Some finessed cards can be lost after the clue, so check touched before and after clue
				return (game.me.thoughts[o].touched || c.touched) && c.matches(card, { infer: true }) && !trash.includes(order) && (i !== target || o < order);
			})()));

		if (duplicates.length > 0)
			bad_touch.push(order);
	}

	return { bad_touch, cm_dupe, trash, avoidable_dupe };
}

/**
 * @param  {State} state
 * @param  {Player} player
 * @param  {Player} hypo_player
 * @param  {Player} me 		Provided if we are giving the clue, so that we don't count already playing cards that we know about.
 */
export function playables_result(state, player, hypo_player, me = player) {
	const finesses = [];
	const playables = [];

	for (const order of hypo_player.hypo_plays) {
		const playerIndex = state.hands.findIndex(hand => hand.includes(order));
		const old_card = player.thoughts[order];
		const hypo_card = hypo_player.thoughts[order];

		const already_playing = me.hypo_plays.has(order) ||
			Array.from(me.hypo_plays).some(o => state.deck[o].matches(state.deck[order])) ||
			me.links.some(link => link.identities.every(i => state.deck[order].matches(i)) && link.orders.every(o => me.hypo_plays.has(o)));

		// Only counts as a playable if it wasn't already playing
		if (already_playing)
			continue;

		if (hypo_card.blind_playing && !old_card.blind_playing)
			finesses.push({ playerIndex, card: hypo_card });

		playables.push({ playerIndex, card: hypo_card });
	}

	return { finesses, playables };
}

/**
 * @param  {Player} player
 * @param  {Player} hypo_player
 * @param  {number[]} hand
 */
export function cm_result(player, hypo_player, hand) {
	return hand.filter(o => hypo_player.thoughts[o].status === CARD_STATUS.CM && player.thoughts[o].status !== CARD_STATUS.CM);
}
