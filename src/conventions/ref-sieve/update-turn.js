import { team_elim } from '../../basics/helper.js';
import { logCard } from '../../tools/log.js';
import logger from '../../tools/logger.js';

/**
 * @typedef {import('../playful-sieve.js').default} Game
 * @typedef {import('../../basics/State.js').State} State
 * @typedef {import('../../basics/Card.js').Card} Card
 * @typedef {import('../../basics/Card.js').ActualCard} ActualCard
 * @typedef {import('../../types.js').TurnAction} TurnAction
 * @typedef {import('../../types.js').Connection} Connection
 */

/**
 * Performs relevant updates after someone takes a turn.
 * 
 * Impure!
 * @param {Game} game
 * @param {TurnAction} _action
 */
export function update_turn(game, _action) {
	const { common, state } = game;

	/** @type {number[]} */
	const to_remove = [];

	for (let i = 0; i < common.waiting_connections.length; i++) {
		const { connections, conn_index, focus, inference } = common.waiting_connections[i];
		const { reacting, order, identities } = connections[conn_index];
		const last_action = game.last_actions[reacting];
		logger.info(`waiting for connecting ${logCard(state.deck[order])} ${order} as ${identities.map(logCard)} (${state.playerNames[reacting]}) for inference ${logCard(inference)} ${focus}`);

		// After the turn we were waiting for, the card was played and matches expectation
		if (!state.hands[reacting].includes(order) && last_action.type === 'play') {
			if (!identities.some(identity => state.deck[last_action.order].matches(identity))) {
				logger.info('card revealed to not be', identities.map(logCard).join(), 'removing connection as', logCard(inference));

				let new_inferred = common.thoughts[focus].inferred.subtract(inference);

				const card_reset = new_inferred.length === 0;

				if (card_reset)
					new_inferred = common.thoughts[focus].old_inferred.intersect(common.thoughts[focus].possible);

				common.updateThoughts(focus, (draft) => {
					draft.inferred = new_inferred;
					if (card_reset)
						draft.old_inferred = undefined;
				});

				to_remove.push(i);
			}
			else {
				logger.info(`waiting card ${identities.length === 1 ? logCard(identities[0]) : '(unknown)'} played`);

				// Advance waiting connection to next card that still exists
				common.waiting_connections[i].conn_index = connections.findIndex((conn, index) =>
					index > conn_index && state.hands[conn.reacting].includes(conn.order));

				if (common.waiting_connections[i].conn_index === -1)
					to_remove.push(i);
			}
		}
	}

	// Filter out connections that have been removed (or connections to the same card where others have been demonstrated)
	common.waiting_connections = common.waiting_connections.filter((_, i) => !to_remove.includes(i));

	common.update_hypo_stacks(state);
	common.good_touch_elim(state);
	team_elim(game);
}
