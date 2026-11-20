// Interactions.js — EVERYTHING a person can do to or near a person in this game, as a catalogue (pure; the author 19.11: «любое взаимодействие — NPC должен
// реагировать так же, как человек… подробно, все-все-все»). The engine that answers them is Reaction.js; the game's own events are mapped onto these
// kinds by InteractionLife.js.
//
// A row: [id, group, valence, arousal, flags]
//   valence  −1 (a serious harm / an insult) … +1 (a great help / a gift he loves): what the thing is WORTH to him before his character and the past are weighed
//   arousal  0 (a calm, small thing) … 1 (a shock): how fast and how loud he answers
//   flags    letters: d — done to HIM directly; w — done near / seen (a witness); i — needs an item (`ev.item`); h — a physical contact (touch);
//            s — it is speech; m — it is magic; c — a crime in the town's eyes; p — a favour (it may be repaid / remembered with gratitude);
//            a — it may be an accident (the doer's intent is judged: `ev.accident`); r — a request / an order (he may comply or decline)
export const GROUPS = ['social', 'show', 'gift', 'help', 'harm', 'presence', 'magic', 'trade', 'witness'];

const R = (id, group, valence, arousal, flags = '') => ({ id, group, valence, arousal, flags });
export const ROWS = [
    // ---- social: words and manners
    R('greet_word', 'social', 0.25, 0.1, 'ds'), R('greet_wave', 'social', 0.25, 0.1, 'd'), R('greet_bow', 'social', 0.4, 0.15, 'd'),
    R('farewell', 'social', 0.1, 0.05, 'ds'), R('thanks_say', 'social', 0.45, 0.1, 'ds'), R('sorry_say', 'social', 0.3, 0.1, 'ds'),
    R('compliment', 'social', 0.5, 0.2, 'ds'), R('insult', 'social', -0.6, 0.55, 'dsc'), R('joke', 'social', 0.3, 0.3, 'ds'),
    R('flirt', 'social', 0.3, 0.35, 'ds'), R('threat_say', 'social', -0.7, 0.7, 'dsc'), R('question_ask', 'social', 0.05, 0.1, 'ds'),
    R('request_help_say', 'social', 0.1, 0.2, 'dsr'), R('order_say', 'social', -0.05, 0.25, 'dsr'), R('gossip_share', 'social', 0.2, 0.2, 'ds'),
    R('invite_follow', 'social', 0.15, 0.2, 'dr'), R('ignore_him', 'social', -0.2, 0.15, 'd'), R('stare_long', 'social', -0.25, 0.3, 'd'),
    R('shout_loud', 'social', -0.3, 0.6, 'ds'), R('whisper_secret', 'social', 0.25, 0.2, 'ds'), R('lie_caught', 'social', -0.45, 0.4, 'dsc'),
    R('promise', 'social', 0.3, 0.15, 'ds'), R('apology_after_harm', 'social', 0.35, 0.15, 'dsp'), R('sing_dance', 'social', 0.25, 0.4, 'dw'),
    R('beckon_come', 'social', 0.05, 0.15, 'dr'), R('wave_away', 'social', -0.3, 0.3, 'd'), R('hand_shake', 'social', 0.4, 0.15, 'dh'),
    R('hug', 'social', 0.45, 0.3, 'dh'), R('tap_shoulder', 'social', -0.08, 0.3, 'dha'), R('laugh_at', 'social', -0.45, 0.45, 'd'),
    // ---- show: the hand, the thing held up
    R('show_point', 'show', 0.05, 0.15, 'd'), R('show_item', 'show', 0.2, 0.2, 'di'), R('show_danger', 'show', 0.1, 0.5, 'dw'),
    R('show_place_good', 'show', 0.2, 0.2, 'd'), R('point_at_him', 'show', -0.15, 0.3, 'd'),
    // ---- gifts and things changing hands
    R('give_hand', 'gift', 0.55, 0.25, 'dip'), R('give_food', 'gift', 0.6, 0.25, 'dip'), R('give_coins', 'gift', 0.55, 0.3, 'dip'),
    R('give_weapon', 'gift', 0.45, 0.35, 'dip'), R('give_junk', 'gift', -0.1, 0.2, 'di'), R('give_gross', 'gift', -0.55, 0.45, 'di'),
    R('toss_gentle_to', 'gift', 0.3, 0.3, 'di'), R('throw_at_hit', 'gift', -0.65, 0.75, 'dia'), R('throw_at_miss', 'gift', -0.4, 0.55, 'dia'),
    R('drop_item_near', 'gift', 0.1, 0.2, 'wi'), R('return_lost_item', 'gift', 0.7, 0.3, 'dip'), R('repay_debt', 'gift', 0.5, 0.2, 'dip'),
    // ---- trade
    R('offer_trade', 'trade', 0.15, 0.15, 'd'), R('pay_fair', 'trade', 0.3, 0.1, 'd'), R('pay_short', 'trade', -0.4, 0.4, 'dc'),
    R('haggle', 'trade', -0.05, 0.25, 'ds'), R('put_item_on_counter', 'trade', 0.1, 0.1, 'di'), R('take_his_goods', 'trade', -0.8, 0.8, 'dc'),
    R('steal_from_pocket', 'trade', -0.85, 0.8, 'dc'), R('steal_seen', 'trade', -0.6, 0.6, 'wc'), R('sell_him_stolen', 'trade', -0.3, 0.3, 'dic'),
    // ---- help
    R('help_unstick', 'help', 0.8, 0.5, 'dp'), R('help_levitate_free', 'help', 0.8, 0.5, 'dpm'), R('make_bridge_for', 'help', 0.6, 0.35, 'dpm'),
    R('heal_him', 'help', 0.8, 0.45, 'dpm'), R('heal_potion', 'help', 0.75, 0.4, 'dpi'), R('give_water_drink', 'help', 0.5, 0.2, 'dpi'),
    R('feed_him_hungry', 'help', 0.7, 0.25, 'dpi'), R('put_out_fire_on_him', 'help', 0.9, 0.7, 'dpm'), R('save_drowning', 'help', 0.95, 0.8, 'dp'),
    R('save_from_monster', 'help', 0.95, 0.85, 'dp'), R('carry_him_hurt', 'help', 0.7, 0.45, 'dph'), R('warm_him_cold', 'help', 0.55, 0.3, 'dp'),
    R('light_for_him_dark', 'help', 0.35, 0.2, 'dpm'), R('repair_his_house', 'help', 0.7, 0.3, 'dp'), R('water_his_field', 'help', 0.5, 0.2, 'dpm'),
    R('protect_shield_for', 'help', 0.7, 0.5, 'dpm'), R('free_from_ice_or_web', 'help', 0.85, 0.6, 'dpm'), R('give_way_to_him', 'help', 0.15, 0.1, 'd'),
    R('open_door_for', 'help', 0.2, 0.1, 'd'), R('guard_him_walk', 'help', 0.45, 0.2, 'dp'), R('find_his_lost_child_or_pet', 'help', 0.95, 0.6, 'dp'),
    // ---- harm: done to him
    R('slap', 'harm', -0.6, 0.7, 'dhc'), R('punch', 'harm', -0.8, 0.85, 'dhc'), R('kick', 'harm', -0.8, 0.85, 'dhc'), R('sword_hit', 'harm', -0.95, 0.95, 'dc'),
    R('push_hard', 'harm', -0.55, 0.7, 'dha'), R('knock_down', 'harm', -0.75, 0.85, 'dhc'), R('spell_hit_harmful', 'harm', -0.95, 0.95, 'dmc'),
    R('freeze_him', 'harm', -0.8, 0.85, 'dmc'), R('burn_him', 'harm', -0.95, 0.95, 'dmc'), R('imperius_on_him', 'harm', -0.9, 0.8, 'dmc'),
    R('levitate_him_lift', 'harm', -0.35, 0.7, 'dma'), R('levitate_him_play', 'harm', 0.1, 0.5, 'dm'), R('disarm_him', 'harm', -0.5, 0.65, 'dmc'),
    R('cut_limb', 'harm', -1, 1, 'dc'), R('aim_wand_at', 'harm', -0.45, 0.6, 'dm'), R('draw_weapon_near', 'harm', -0.4, 0.55, 'd'),
    R('spell_hits_him_accident', 'harm', -0.5, 0.7, 'dma'), R('trap_him_web_ice', 'harm', -0.7, 0.75, 'dmc'), R('mock_him_dance_corpse', 'harm', -0.6, 0.5, 'dw'),
    // ---- presence
    R('approach_close', 'presence', -0.1, 0.25, 'd'), R('approach_run_at', 'presence', -0.3, 0.55, 'd'), R('follow_him_long', 'presence', -0.3, 0.3, 'd'),
    R('block_path', 'presence', -0.25, 0.3, 'd'), R('crouch_to_level', 'presence', 0.2, 0.1, 'd'), R('sit_beside', 'presence', 0.25, 0.1, 'd'),
    R('sleep_near', 'presence', 0.0, 0.05, 'w'), R('run_past_close', 'presence', -0.15, 0.4, 'da'), R('fly_over', 'presence', 0.0, 0.3, 'w'),
    R('enter_house_uninvited', 'presence', -0.55, 0.55, 'dc'), R('enter_house_invited', 'presence', 0.2, 0.15, 'd'), R('knock_door', 'presence', 0.1, 0.15, 'd'),
    R('trample_field', 'presence', -0.5, 0.45, 'dca'), R('stand_behind_him', 'presence', -0.2, 0.35, 'd'), R('appear_sudden', 'presence', -0.05, 0.6, 'da'),
    // ---- magic around
    R('fireworks_show', 'magic', 0.55, 0.55, 'wm'), R('spell_cast_near_harmless', 'magic', 0.05, 0.4, 'wm'), R('explosion_near', 'magic', -0.55, 0.9, 'wma'),
    R('fire_set_near', 'magic', -0.6, 0.8, 'wmc'), R('lightning_near', 'magic', -0.5, 0.85, 'wm'), R('dragon_or_boss_seen', 'magic', -0.9, 1, 'w'),
    R('rain_or_rainbow_made', 'magic', 0.35, 0.3, 'wm'), R('light_made_night', 'magic', 0.3, 0.2, 'wm'), R('wand_trick_small', 'magic', 0.3, 0.3, 'wm'),
    // ---- witnessed: others suffer or are helped
    R('kill_neighbour_seen', 'witness', -0.95, 0.95, 'wc'), R('kill_animal_pet', 'witness', -0.5, 0.6, 'wc'), R('kill_monster_seen', 'witness', 0.7, 0.7, 'wp'),
    R('hurt_neighbour_seen', 'witness', -0.6, 0.7, 'wc'), R('help_neighbour_seen', 'witness', 0.5, 0.3, 'wp'), R('gift_neighbour_seen', 'witness', 0.3, 0.2, 'wp'),
    R('rob_neighbour_seen', 'witness', -0.7, 0.7, 'wc'), R('break_door_window', 'witness', -0.6, 0.6, 'wc'), R('wreck_house_seen', 'witness', -0.9, 0.9, 'wc'),
];
export const KINDS = Object.fromEntries(ROWS.map((r) => [r.id, r]));
export const KIND_IDS = ROWS.map((r) => r.id);

/** A flag of a kind. */
export const has = (kind, f) => !!KINDS[kind] && KINDS[kind].flags.includes(f);

// ------------------------------------------------------------------ the things handed over (what an item is to a person)
/** The class of a thing for a person: what it is good for and how it feels. */
export const ITEM_CLASS = {
    food: new Set(['apple', 'redApple', 'bread', 'meat', 'steak', 'fish', 'cheese', 'baksadi_pear', 'azure_berry', 'sun_herb', 'pie', 'milk']),
    drink: new Set(['potion', 'flask', 'water']),
    coin: new Set(['coins']),
    weapon: new Set(['weapon', 'sword', 'axe', 'bow', 'arrows', 'hammer', 'shield', 'dagger']),
    magic: new Set(['wand', 'scroll', 'book', 'crystal', 'iceRod', 'phoenixFeather', 'dragonEgg', 'spencerFeather']),
    armor: new Set(['armor', 'robe', 'helmet']),
    tool: new Set(['pickaxe', 'shovel', 'rod', 'fishingRod', 'hoe', 'backpack', 'lantern', 'torch']),
    gross: new Set(['bones', 'skull', 'corpse_part', 'arm', 'leg', 'head', 'rotten', 'spiderLeg', 'web', 'carnivoreHead', 'gargoyleHead']),
};
export function itemClass(kind) {
    for (const [c, set] of Object.entries(ITEM_CLASS)) if (set.has(kind)) return c;
    return /bone|skull|rot|corpse|severed|limb/i.test(String(kind)) ? 'gross' : 'junk';
}
