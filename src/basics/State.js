import { CLUE, HAND_SIZE } from '../constants.js';
import { IdentitySet } from './IdentitySet.js';
import { ActualCard } from '../basics/Card.js';
import { cardCount, cardTouched, colourableSuits } from '../variants.js';

/**
 * @typedef {import('../basics/Card.js').Card} Card
 * @typedef {import('../types.js').Action} Action
 * @typedef {import('../types.js').BaseClue} BaseClue
 * @typedef {import('../types.js').Clue} Clue
 * @typedef {import('../types.js').Identity} Identity
 * @typedef {import('../types.js').ClueAction} ClueAction
 * @typedef {import('../types.js').DiscardAction} DiscardAction
 * @typedef {import('../types.js').TurnAction} TurnAction
 * @typedef {import('../types.js').PlayAction} PlayAction
 * @typedef {import('../types.js').PerformAction} PerformAction
 * @typedef {import('../variants.js').Variant} Variant
 * @typedef {import('../types-live.js').TableOptions} TableOptions
 */

export class State {
	turn_count = 0;
	clue_tokens = 8;
	strikes = 0;
	early_game = true;

	/** @type {'shout' | 'scream' | 'gen' | undefined} */
	discard_state;

	/** @type {Identity | undefined} */
	dda = undefined;

	hands = /** @type {number[][]} */ ([]);
	deck = /** @type {ActualCard[]} */ ([]);

	actionList = /** @type {Action[][]} */ ([]);

	play_stacks = /** @type {number[]} */ ([]);
	discard_stacks = /** @type {number[][]} */ ([]);
	max_ranks = /** @type {number[]} */ ([]);

	_cardCount = /** @type {number[][]} */ ([]);

	/** @type {number} */
	cardsLeft;

	/** @type {IdentitySet} */
	base_ids;

	/** @type {IdentitySet} */
	all_ids;

	currentPlayerIndex = 0;

	/** The order of the most recently drawn card. */
	cardOrder = -1;

	endgameTurns = -1;

	/**
	 * @param {string[]} playerNames
	 * @param {number} ourPlayerIndex
	 * @param {Variant} variant
	 * @param {TableOptions} options
	 */
	constructor(playerNames, ourPlayerIndex, variant, options) {
		/** @type {string[]} */
		this.playerNames = playerNames;
		/** @type {number} */
		this.numPlayers = playerNames.length;
		/** @type {number} */
		this.ourPlayerIndex = ourPlayerIndex;

		/** @type {Variant}} */
		this.variant = variant;

		/** @type {TableOptions} */
		this.options = options;

		this.cardsLeft = 0;

		for (let suitIndex = 0; suitIndex < this.variant.suits.length; suitIndex++) {
			const suitCount = [];

			for (let rank = 1; rank <= 5; rank++) {
				const count = cardCount(variant, { suitIndex, rank });
				this.cardsLeft += count;
				suitCount.push(count);
			}
			this._cardCount.push(suitCount);
		}

		for (let suitIndex = 0; suitIndex < this.variant.suits.length; suitIndex++) {
			this.play_stacks.push(0);
			this.discard_stacks.push([0, 0, 0, 0, 0]);
			this.max_ranks.push(5);
		}

		for (let i = 0; i < this.numPlayers; i++)
			this.hands.push([]);

		this.base_ids = new IdentitySet(variant.suits.length, 0);
		this.all_ids = new IdentitySet(variant.suits.length);
	}

	/** @param {State} json */
	static fromJSON(json) {
		const res = Object.create(this.prototype);

		for (const key of Object.keys(json)) {
			if (json[key] !== undefined) {
				if (key === 'deck')
					res.deck = json.deck.map(ActualCard.fromJSON);
				else
					res[key] = json[key];
			}
		}
		return res;
	}

	get ourHand() {
		return this.hands[this.ourPlayerIndex];
	}

	/**
	 * Returns the hand size.
	 */
	get handSize() {
		return HAND_SIZE[this.numPlayers] + (this.options?.oneLessCard ? -1 : this.options?.oneExtraCard ? 1 : 0);
	}

	get score() {
		return this.play_stacks.reduce((sum, stack) => sum + stack);
	}

	get maxScore() {
		return this.max_ranks.reduce((acc, curr) => acc + curr);
	}

	/**
	 * Returns the current pace (current score + cards left + # of players - max score).
	 */
	get pace() {
		return this.score + this.cardsLeft + this.numPlayers - this.maxScore;
	}

	get ended() {
		return this.endgameTurns === 0;
	}

	/**
	 * Returns the player index of the next player, in turn order.
	 * @param {number} playerIndex
	 */
	nextPlayerIndex(playerIndex) {
		return (playerIndex + 1) % this.numPlayers;
	}

	/**
	 * Returns the player index of the next player, in turn order.
	 * @param {number} playerIndex
	 */
	lastPlayerIndex(playerIndex) {
		return (playerIndex + this.numPlayers - 1) % this.numPlayers;
	}

	/**
	 * Returns whether the state is in the endgame.
	 */
	inEndgame() {
		return this.pace < this.numPlayers;
	}

	/**
	 * Returns a blank copy of the state, as if the game had restarted.
	 */
	createBlank() {
		return new State(this.playerNames, this.ourPlayerIndex, this.variant, this.options);
	}

	shallowCopy() {
		const copy = Object.create(Object.getPrototypeOf(this));

		for (const key of Object.keys(this)) {
			if (this[key] !== undefined)
				copy[key] = this[key];
		}
		return copy;
	}

	/**
	 * Returns a copy of the state with only minimal properties (cheaper than cloning).
	 */
	minimalCopy() {
		const newState = new State(this.playerNames, this.ourPlayerIndex, this.variant, this.options);

		newState.turn_count = this.turn_count;
		newState.clue_tokens = this.clue_tokens;
		newState.strikes = this.strikes;
		newState.early_game = this.early_game;

		newState.discard_state = this.discard_state;
		newState.dda = this.dda !== undefined ? { ...this.dda } : this.dda;

		newState.hands = this.hands.map(hand => hand.slice());
		newState.deck = this.deck.map(c => c.shallowCopy());

		newState.actionList = this.actionList.map(actions => actions.slice());

		newState.play_stacks = this.play_stacks.slice();
		newState.discard_stacks = this.discard_stacks.map(stack => stack.slice());
		newState.max_ranks = this.max_ranks.slice();

		newState.currentPlayerIndex = this.currentPlayerIndex;
		newState.cardOrder = this.cardOrder;
		newState.cardsLeft = this.cardsLeft;
		newState.endgameTurns = this.endgameTurns;

		return newState;
	}

	/**
	 * Returns the number of cards matching an identity on either the play stacks or the discard stacks.
	 * @param {Identity} identity
	 */
	baseCount({ suitIndex, rank }) {
		if (suitIndex === -1 || rank === -1)
			return 0;

		return (this.play_stacks[suitIndex] >= rank ? 1 : 0) + this.discard_stacks[suitIndex][rank - 1];
	}

	/**
	 * Returns the multiplicity of the index.
	 * @param {Identity} identity
	 */
	cardCount({ suitIndex, rank }) {
		if (suitIndex === -1 || rank === -1)
			return 4;

		return this._cardCount[suitIndex][rank - 1];
	}

	/**
	 * Returns whether the given identity is basic trash (has been played already or can never be played).
	 * @param {Identity} identity
	 */
	isBasicTrash({ suitIndex, rank }) {
		if (suitIndex === -1 || rank === -1)
			return false;

		return rank <= this.play_stacks[suitIndex] || rank > this.max_ranks[suitIndex];
	}

	/**
	 * Returns whether the given suitIndex and rank is currently critical.
	 * @param {Identity} identity
	 */
	isCritical(identity) {
		const { suitIndex, rank } = identity;

		if (suitIndex === -1 || rank === -1)
			return false;

		return !this.isBasicTrash(identity) && this.discard_stacks[suitIndex][rank - 1] === (cardCount(this.variant, identity) - 1);
	}

	/**
	 * Returns how far the given identity are from playable. 0 means it is currently playable.
	 * @param {Identity} identity
	 */
	playableAway({ suitIndex, rank }) {
		if (suitIndex === -1 || rank === -1)
			return 5;

		return rank - (this.play_stacks[suitIndex] + 1);
	}

	/**
	 * Returns whether the given identity is currently playable on the stacks.
	 * @param {Identity} identity
	 */
	isPlayable(identity) {
		return this.playableAway(identity) === 0;
	}

	/**
	 * Returns whether a card's order was part of the starting hands.
	 * @param {number} order
	 */
	inStartingHand(order) {
		return order < this.numPlayers * this.handSize;
	}

	/**
	 * @param {number} target
	 */
	allValidClues(target) {
		const clues = /** @type {Clue[]} */ ([]);

		for (let rank = 1; rank <= 5; rank++)
			clues.push({ type: CLUE.RANK, value: rank, target });

		for (let suitIndex = 0; suitIndex < colourableSuits(this.variant).length; suitIndex++)
			clues.push({ type: CLUE.COLOUR, value: suitIndex, target });

		return clues.filter(clue => this.clueTouched(this.hands[target], clue).length > 0);
	}

	/**
	 * Returns whether one of the card's inferences matches its actual suitIndex and rank.
	 * Returns true if the card has only 1 possibility or the card is unknown.
	 * @param {Card} card
	 */
	hasConsistentInferences(card) {
		const actual_id = this.deck[card.order].identity();

		return actual_id === undefined || card.possible.length === 1 || card.inferred.has(actual_id);
	}

	/**
	 * Returns whether the state contains a variant matching the regex.
	 * @param {RegExp} variantRegex
	 */
	includesVariant(variantRegex) {
		return this.variant.suits.some(suit => variantRegex.test(suit));
	}

	/**
	 * Returns the orders touched by the clue.
	 * @param {number[]} orders
	 * @param {BaseClue} clue
	 */
	clueTouched(orders, clue) {
		return orders.filter(o => this.deck[o].identity() !== undefined && cardTouched(this.deck[o], this.variant, clue));
	}
}
