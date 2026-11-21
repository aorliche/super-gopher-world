import {$, $$, Point, Rect} from './util.js';

// Debug
let actorId = 0;
let begin = false;

const G = 1.5;				// Acceleration due to gravity
const FAR_AWAY = 1000;		// Tick optimization, how far away from edge of the screen to stop update
const N_CLOUDS_START = 10;	// How many clouds we start with
const N_CLOUDS = 12;		// Spawn up to this many clouds beyond left edge
const PALETTE_CENTER_X = 1120;	// Center of palette
const PALETTE_TOP_Y = 20;		// Margin from top and bottom to palette
const PALETTE_IMG_SIZE = 64;	// Max dimension of palette element
const PALETTE_WIDTH = 100;	// Width of the palette strip
const PALETTE_Y_PAD = 10;	// Padding on either end of palette element
const ZIGGY_DX = 2;			// Ziggy moves this fast per frame
const ZIGGY_DY = 1;
const ZIGGY_X_RADIUS = 200; // Ziggy travels twice this many pixels in x
const ZIGGY_Y_RADIUS = 15;	// Ziggy travels twice this many pixels in y
const ZIGGY_X_TO = ZIGGY_X_RADIUS/ZIGGY_DX + 50;	// Make sure ziggy doesn't get stuck
const DAMAGE_BLINK_T = 5;	// Frames to blink on off for taking damage
const DAMAGE_INV_T = 60;	// Invulnerable frames while can't take more damage
const START_LIFE = 3;		// Lives you start with
const MAX_LIFE = 5;			// Max lives
const HEART_SIZE = 32;		// HUD heart width
const HEART_PAD = 10;		// HUD heart padding
const HEART_TIME = 5;		// Heart exploding animation time

// For terrain snapping to grid
function locStr(p) {
	return p.x + ',' + p.y;
}

// Slightly inefficient collision detection (don't remember corners)
function overlaps(item1, item2) {
	// I'm actually not sure that the "fast path" is any faster
	const d = item1.rect.topLeft.sub(item2.rect.topLeft).mag();
	const dMax = item1.rect.hypot + item2.rect.hypot;
	if (d > dMax) {
		return false;
	}
	// Since the slow path is so simple
	const c1 = item1.corners;
	const c2 = item2.corners;
	for (let i=0; i<4; i++) {
		if (item1.rect.contains(c2[i])) {
			return true;
		}
		if (item2.rect.contains(c1[i])) {
			return true;
		}
	}
	return false;
}

// Check whether we need to turn off vx or vy, by setting
// One of them to zero
// Eliminates wall-hanging problem
function obstacleInPath(actor, obstacle, origTopLeft, vx, vy) {
	const sav = actor.rect.topLeft.clone();
	actor.rect.topLeft = origTopLeft.clone();
	actor.rect.topLeft.x += vx;
	actor.rect.topLeft.y += vy;
	const collides = overlaps(actor, obstacle);
	actor.rect.topLeft = sav;
	return collides;
}

// If we move and detect a collision, move us back to just touching
function walkBack(actor, obstacle, origTopLeft) {
	// We have already moved back enough from another collider
	if (!overlaps(actor, obstacle)) {
		return;
	}
	// Check which velocities to turn off
	if (obstacleInPath(actor, obstacle, origTopLeft, actor.vx, 0)) {
		actor.vx = 0;
	}
	if (obstacleInPath(actor, obstacle, origTopLeft, 0, actor.vy)) {
		actor.vy = 0;
	}
	const d = actor.rect.topLeft.sub(origTopLeft);
	const a = d.mag();
	// We're packed closely
	if (a < 0.01) {
		return;
	}
	const dd = d.scale(-0.5/a);
	let diff;
	do {
		actor.rect.topLeft = actor.rect.topLeft.add(dd);
		diff = actor.rect.topLeft.sub(origTopLeft);
	} while (overlaps(actor, obstacle));
	if (diff.dot(dd) > 0) {
		actor.rect.topLeft = origTopLeft;
	}
}

class SunBackground {
	constructor(params, grid) {
		this.grid = grid;
		this.center = params.center;
		this.r = params.r;
		this.rayTheta = params.rayTheta;
		this.nRays = params.nRays;
		this.skyColor = params.skyColor;
		this.sunColor = params.sunColor;
		this.rotRate = params.rotRate;
		this.startTheta = 0;
	}

	draw(ctx) {
		ctx.fillStyle = this.skyColor;
		ctx.fillRect(0, 0, this.grid.canvas.width, this.grid.canvas.height);
		ctx.beginPath();
		ctx.fillStyle = this.sunColor;
		ctx.arc(this.center.x, this.center.y, this.r, 0, 2*Math.PI);
		ctx.fill();
		const dTheta = 2*Math.PI/this.nRays;
		for (let i=0; i<this.nRays; i++) {
			ctx.beginPath();
			ctx.moveTo(this.center.x, this.center.y);
			const theta = dTheta*i;
			const ts = this.startTheta+theta-this.rayTheta/2;
			const te = this.startTheta+theta+this.rayTheta/2;
			const xs = this.center.x + 2000*Math.cos(ts);
			const ys = this.center.y + 2000*Math.sin(ts);
			const xe = this.center.x + 2000*Math.cos(te);
			const ye = this.center.y + 2000*Math.sin(te);
			ctx.lineTo(xs, ys);
			ctx.lineTo(xe, ye);
			ctx.lineTo(this.center.x, this.center.y);
			ctx.fill();
		}
	}

	tick() {
		this.startTheta += this.rotRate;
	}
}

class Cloud {
	constructor(topLeft, grid) {
		this.grid = grid;
		this.bot = new Rect(new Point(0,45), 150, 20);
		this.puffs = [
			{x: 0, y: 45, r: 20},
			{x: 30, y: 40, r: 25},
			{x: 60, y: 35, r: 30},
			{x: 90, y: 30, r: 35},
			{x: 120, y: 25, r: 40},
			{x: 150, y: 20, r: 45},
		];
		this.topLeft = topLeft;
		const a = Math.random();
		this.dx = 0.05 + Math.pow(0.5*a, 2);
		this.scale = 0.6 + a;
	}

	draw(ctx) {
		ctx.save();
		ctx.translate(this.topLeft.x, this.topLeft.y);
		ctx.scale(this.scale, this.scale);
		ctx.strokeStyle = '#bbb';
		ctx.lineWidth = 20;
		ctx.strokeRect(this.bot.topLeft.x, this.bot.topLeft.y, this.bot.width, this.bot.height);
		this.puffs.forEach(p => {
			ctx.beginPath();
			ctx.arc(p.x, p.y, p.r, 0, 2*Math.PI);
			ctx.stroke();
		});
		ctx.fillStyle = '#ccc';
		ctx.fillRect(this.bot.topLeft.x, this.bot.topLeft.y, this.bot.width, this.bot.height);
		this.puffs.forEach(p => {
			ctx.beginPath();
			ctx.arc(p.x, p.y, p.r, 0, 2*Math.PI);
			ctx.fill();
		});
		ctx.restore();
	}

	tick() {
		this.topLeft.x += this.dx;
		// Add some margin
		if (this.topLeft.x > this.grid.canvas.width + 100) {
			this.toRemove = true;
		}
	}
}

class Actor {
	constructor(rect, grid, images) {
		this.rect = rect;
		this.grid = grid;
		this.images = images;
		// For terrain only
		this.loc = grid.getLoc(rect.topLeft);
	}

	contains(p) {
		return this.rect.contains(p);
	}

	get corners() {
		return [
			new Point(this.rect.topLeft.x, this.rect.topLeft.y),
			new Point(this.rect.topLeft.x, this.rect.topLeft.y + this.rect.height),
			new Point(this.rect.topLeft.x + this.rect.width, this.rect.topLeft.y + this.rect.height),
			new Point(this.rect.topLeft.x + this.rect.width, this.rect.topLeft.y),
		];
	}

	get locStr() {
		return locStr(this.loc);
	}

	// Jump up and fall down
	die() {
		this.vy = -20;
		this.dead = true;
	}
}

class StoneFloor extends Actor {
	constructor(rect, grid, images) {
		super(rect, grid, images);
	}

	draw(ctx) {
		const left = this.grid.terrain[locStr(new Point(this.loc.x-1, this.loc.y))];
		const right = this.grid.terrain[locStr(new Point(this.loc.x+1, this.loc.y))];
		const above = this.grid.terrain[locStr(new Point(this.loc.x, this.loc.y-1))];
		let offsetX, offsetY;
		let imgName;
		if (above instanceof StoneFloor) {
			imgName = 'stone-floor';
			offsetX = 0;
			offsetY = 1;
		} else if (left instanceof StoneFloor && right instanceof StoneFloor) {
			imgName = 'stone-floor-middle';
			offsetX = 0;
			offsetY = -8;
		} else if (left instanceof StoneFloor) {
			imgName = 'stone-floor-right';
			offsetX = -1;
			offsetY = -8;
		} else if (right instanceof StoneFloor) {
			imgName = 'stone-floor-left';
			offsetX = -4;
			offsetY = -8;
		} else {
			imgName = 'stone-floor-island';
			offsetX = -5;
			offsetY = -8;
		}
		ctx.drawImage(
			this.images[imgName],
			this.rect.topLeft.x - this.grid.topLeft.x + offsetX,
			this.rect.topLeft.y - this.grid.topLeft.y + offsetY,
		)
	}
}

class Bricks extends Actor {
	constructor(rect, grid, images) {
		super(rect, grid, images);
	}

	draw(ctx) {
		const locInt = this.loc.x + this.loc.y;
		let imgName;
		if (locInt % 2 == 0) {
			imgName = 'bricks-1';
		} else {
			imgName = 'bricks-2';
		}
		ctx.drawImage(
			this.images[imgName],
			this.rect.topLeft.x - this.grid.topLeft.x,
			this.rect.topLeft.y - this.grid.topLeft.y,
		);
	}
}

class Lava extends Actor {
	constructor(rect, grid, images) {
		super(rect, grid, images);
		this.timer = Math.floor(100*Math.random());
		this.period = 5;
	}

	draw(ctx) {
		const bit = Math.floor(this.timer / this.period) % 3;
		let img, offsetX, offsetY;
		if (bit == 0) {
			img = this.images['lava-1'];
			offsetX = -12;
			offsetY = -31;
		} else if (bit == 1) {
			img = this.images['lava-2'];
			offsetX = -12;
			offsetY = -36;
		} else {
			img = this.images['lava-3'];
			offsetX = -10;
			offsetY = -35;
		}
		ctx.drawImage(
			img,
			this.rect.topLeft.x - this.grid.topLeft.x + offsetX,
			this.rect.topLeft.y - this.grid.topLeft.y + offsetY,
		);
	}

	tick() {
		this.timer++;
	}
}

class Crate extends Actor {
	constructor(rect, grid, images) {
		super(rect, grid, images);
		const randIdx = Math.floor(Math.random()*3);
		this.img = this.images[['crate-1', 'crate-2', 'crate-3'][randIdx]];
		this.vx = 0;
		this.vy = 0;
	}

	draw(ctx) {
		ctx.drawImage(this.img,
			this.rect.topLeft.x - this.grid.topLeft.x,
			this.rect.topLeft.y - this.grid.topLeft.y,
		);
	}

	push(dx) {
		const sav = this.rect.topLeft.clone();
		this.rect.topLeft.x += dx;
		const colliders = this.grid.getColliders(this);
		colliders.forEach(c => walkBack(this, c, sav.clone()));
	}

	tick() {
		const sav = this.rect.topLeft.clone();
		this.vy += G;
		this.rect.topLeft.x += this.vx;
		this.rect.topLeft.y += this.vy;
		const colliders = this.grid.getColliders(this);
		colliders.forEach(c => walkBack(this, c, sav.clone()));
	}
}

class Powerup extends Actor {
	constructor(rect, grid, images) {
		super(rect, grid, images);
	}
}

class Heart extends Powerup {
	constructor(rect, grid, images) {
		super(rect, grid, images);
		this.img = images['heart'];
		this.timer = 0;
		this.exploding = false;
	}

	draw(ctx) {
		const mult = this.timer / HEART_TIME + 1;
		const w = this.img.width * mult;
		const h = this.img.height * mult;
		let x = this.rect.topLeft.x - this.grid.topLeft.x;
		let y = this.rect.topLeft.y - this.grid.topLeft.y;
		x = x + this.img.width/2 - w/2;
		y = y + this.img.height/2 - h/2;
		ctx.globalAlpha = 2 - mult;
		ctx.drawImage(this.img, x, y, w, h);
		ctx.globalAlpha = 1;
	}

	explode() {
		this.exploding = true;
	}
	
	tick() {
		if (this.exploding) {
			this.timer++;
		}
		if (this.timer >= HEART_TIME) {
			for (let i=0; i<this.grid.powerups.length; i++) {
				if (this.grid.powerups[i] == this) {
					this.grid.powerups.splice(i, 1);
					i--;
				}
			}
		}
	}
}

class Ziggy extends Actor {
	constructor(rect, grid, images) {
		super(rect, grid, images);
		this.dx = Math.random() > 0.5 ? -ZIGGY_DX : ZIGGY_DX;
		this.dy = Math.random() > 0.5 ? -ZIGGY_DY : ZIGGY_DY;
		this.vx = 0;
		this.vy = 0;
		this.xLimLeft = this.rect.topLeft.x - ZIGGY_X_RADIUS;
		this.xLimRight = this.rect.topLeft.x + ZIGGY_X_RADIUS;
		this.yLimTop = this.rect.topLeft.y - ZIGGY_Y_RADIUS;
		this.yLimBot = this.rect.topLeft.y + ZIGGY_Y_RADIUS;
		this.xTimer = 0;
		this.yTimer = 0;
		this.moving = true;
	}

	get img() {
		return this.dx < 0 ?
			this.images['ziggy-left'] :
			this.images['ziggy-right'];
	}
	
	draw(ctx) {
		ctx.drawImage(this.img,
			this.rect.topLeft.x - this.grid.topLeft.x,
			this.rect.topLeft.y - this.grid.topLeft.y,
		);
	}

	tick() {
		this.moving = true;
		if (this.rect.topLeft.x < this.xLimLeft) {
			this.dx = Math.abs(this.dx);
			this.xTimer = 0;
		}
		if (this.rect.topLeft.x > this.xLimRight) {
			this.dx = -Math.abs(this.dx);
			this.xTimer = 0;
		}
		if (this.rect.topLeft.y < this.yLimTop) {
			this.dy = Math.abs(this.dy);
		}
		if (this.rect.topLeft.y > this.yLimBot) {
			this.dy = -Math.abs(this.dy);
		}
		if (this.xTimer++ > ZIGGY_X_TO) {
			this.dx = -this.dx;
			this.xTimer = 0;
		}
		this.rect.topLeft.x += this.dx;
		let colliders = this.grid.getColliders(this);
		if (colliders.length > 0) {
			this.moving = false;
			this.rect.topLeft.x -= this.dx;
			colliders.forEach(c => {
				if (c instanceof Player) {
					c.takeDamage();
				}
			});
		}
		this.rect.topLeft.y += this.dy;
		colliders = this.grid.getColliders(this);
		if (colliders.length > 0) {
			this.rect.topLeft.y -= this.dy;
			colliders.forEach(c => {
				// Swooping down on player
				if (c instanceof Player && this.dy > 0) {
					c.takeDamage();
				}
			});
		}
	}
}

class MushroomMan extends Actor {
	constructor(rect, grid, images) {
		super(rect, grid, images);
		this.dx = Math.random() > 0.5 ? -2 : 2;
		this.vx = 0;
		this.vy = 0;
		this.timer = 0;
		this.up = true;
		this.pushed = false;
	}

	get img() {
		if (this.up) {
			return this.dx < 0 ? 
				this.images['mushroom-man-left'] : 
				this.images['mushroom-man-right'];
		} else {
			return this.dx < 0 ? 
				this.images['mushroom-man-boop-left'] : 
				this.images['mushroom-man-boop-right'];
		}
	}

	boop() {
		this.timer = 120;
		if (!this.up) {
			return;
		}
		this.up = false;
		const imgUp = this.images['mushroom-man-left'];
		const imgDown = this.images['mushroom-man-boop-left'];
		this.rect = new Rect(
			new Point(
				this.rect.topLeft.x, 
				this.rect.topLeft.y + imgUp.height - imgDown.height),
			imgDown.width,
			imgDown.height
		);
	}

	unboop() {
		if (this.up) {
			return;
		}
		const sav = this.rect.clone();
		const imgUp = this.images['mushroom-man-left'];
		const imgDown = this.images['mushroom-man-boop-left']; 
		this.rect = new Rect(
			new Point(
				this.rect.topLeft.x, 
				this.rect.topLeft.y - imgUp.height + imgDown.height),
			imgUp.width,
			imgUp.height
		);
		const colliders = this.grid.getColliders(this);
		if (colliders.length > 0) {
			this.rect = sav;
			return;
		}
		this.up = true;
		this.pushed = false;
	}

	draw(ctx) {
		ctx.drawImage(this.img,
			this.rect.topLeft.x - this.grid.topLeft.x,
			this.rect.topLeft.y - this.grid.topLeft.y,
		);
	}

	get dxp() {
		if (this.pushed) return 3*this.dx;
		return this.dx;
	}

	push(v) {
		this.pushed = true;
	}

	tick() {
		if (this.timer > 0) {
			this.timer--;
		}
		if (this.timer == 0) {
			this.unboop();
		}
		if (!this.up && !this.pushed) {
			return;
		}
		this.rect.topLeft.x += this.dxp;
		let colliders = this.grid.getColliders(this);
		if (colliders.length > 0) {
			this.rect.topLeft.x -= this.dxp;
			this.dx = -this.dx;
			colliders.forEach(c => {
				if (c instanceof Player && this.up) {
					c.takeDamage();
				}
			});
			return;
		}
		const sav = this.rect.topLeft.clone();
		this.vx = this.dxp;
		this.vy += G;
		this.rect.topLeft.x += this.vx;
		this.rect.topLeft.y += this.vy;
		colliders = this.grid.getColliders(this);
		colliders.forEach(c => walkBack(this, c, sav.clone()));
	}
}

class Player extends Actor {
	constructor(rect, grid, images) {
		super(rect, grid, images);
		grid.player = this;
		this.right = true;
		this.vx = 0;
		this.vy = 0;
		this.keys = {};
		// Remove any previous players
		for (let i=0; i<grid.actors.length; i++) {
			if (grid.actors[i] instanceof Player) {
				// Clear save timeout
				clearInterval(grid.actors[i].intId);
				grid.actors.splice(i, 1);
				i--;
			}
		}
		this.life = START_LIFE;
		this.invTimer = 0;
		// For respawning on death
		this.lastPast = {rect: this.rect.clone(), life: this.life, vx: 0, vy: 0};
		this.lastCur = {rect: this.rect.clone(), life: this.life, vx: 0, vy: 0};
		this.intId = setInterval(() => {
			if (this.life > 0 && this.onSurface) {
				this.lastPast = this.lastCur;
				this.lastCur = {
					rect: this.rect.clone(),
					life: this.life,
					vx: this.vx,
					vy: this.vy,
				};
			}
		}, 5000);
	}

	die() {
		super.die();
		this.life = 0;
		setTimeout(() => {
			this.rect = this.lastPast.rect;
			this.life = this.lastPast.life;
			this.vx = this.lastPast.vx;
			this.vy = this.lastPast.vy;
			this.dead = false;
		}, 3000);
	}

	takeDamage() {
		if (this.life == 0 || this.invTimer > 0) {
			return;
		}
		this.invTimer = DAMAGE_INV_T;
		this.life--;
		if (this.life == 0) {
			this.die();
		}
	}

	draw(ctx) {
		if (this.invTimer > 0 && this.invTimer % DAMAGE_BLINK_T > DAMAGE_BLINK_T/2) {
			return;
		}
		const img = this.right ? this.images['gopher-right'] : this.images['gopher-left'];
		ctx.drawImage(img,
			this.rect.topLeft.x - this.grid.topLeft.x,
			this.rect.topLeft.y - this.grid.topLeft.y,
		);
	}

	keydown(e) {
		if (!['w', 'a', 's', 'd', ' '].includes(e.key)) {
			return false;
		}
		this.keys[e.key] = true;
		return true;
	}

	keyup(e) {
		delete this.keys[e.key];
	}

	move(dx, dy) {
		if (dx != 0) {
			this.vx = dx;
			this.right = dx > 0;
		}
		if (dy != 0) {
			this.vy = dy;
		}
		const sav = this.rect.topLeft.clone();
		this.rect.topLeft.x += dx;
		this.rect.topLeft.y += dy;
		// Push crates
		let colliders = this.grid.getColliders(this);
		colliders.forEach(c => {
			if (c instanceof Crate) {
				c.push(dx);
			}
		});
		// Pull crates
		if (this.keys[' '] && dx != 0) {
			this.rect.topLeft.x -= 2*dx;
			const col2 = this.grid.getColliders(this);
			// Don't get in the way of the crate
			this.rect.topLeft.x += 2*dx;
			col2.forEach(c => {
				if (c instanceof Crate) {
					c.push(dx);
				}
			});
		}
		colliders = this.grid.getColliders(this);
		colliders.forEach(c => walkBack(this, c, sav.clone()));
	}

	get onSurface() {
		const sav = this.rect.topLeft.clone();
		this.rect.topLeft.y += 1;
		const colliders = this.grid.getColliders(this);
		this.rect.topLeft = sav;
		return colliders.length > 0;
	}

	get ziggy() {
		const sav = this.rect.topLeft.clone();
		this.rect.topLeft.y += 1;
		const colliders = this.grid.getColliders(this);
		this.rect.topLeft = sav;
		if (colliders.length == 1 && colliders[0] instanceof Ziggy) {
			return colliders[0];
		}
		return null;
	}

	tick() {
		if (this.invTimer > 0) {
			this.invTimer--;
		}
		const os = this.onSurface;
		if (this.keys['a']) {
			this.move(-5, 0);
		}
		if (this.keys['d']) {
			this.move(5, 0);
		}
		// Clear tangential velocity
		if (!this.keys['a'] && !this.keys['d'] && os) {
			this.vx = 0;
		}
		if (this.keys['w'] && os) {
			this.move(0, -16);
		}
		// Check if on top of Ziggy
		const ziggy = this.ziggy;
		if (ziggy && ziggy.moving) {
			this.rect.topLeft.x += ziggy.dx;
		}
		const sav = this.rect.topLeft.clone();
		// Split collisions into x and y to prevent
		// Hang while pushing crate
		this.rect.topLeft.x += this.vx;
		let colliders = this.grid.getColliders(this);
		colliders.forEach(c => {
			walkBack(this, c, sav.clone());
			if (c instanceof MushroomMan) {
				if (!c.up) {
					c.push(this.vx);
				} else {
					this.takeDamage();
				}
			}
			if (c instanceof Ziggy) {
				this.takeDamage();
			}
			if (c instanceof Lava) {
				this.die();
			}
		});
		this.vy += G;
		this.rect.topLeft.y += this.vy;
		colliders = this.grid.getColliders(this);
		colliders.forEach(c => {
			walkBack(this, c, sav.clone());
			if (c instanceof MushroomMan) {
				c.boop();
			}
			if (c instanceof Lava) {
				this.die();
			}
		});
		// Consider collisions with powerups
		for (let i=0; i<this.grid.powerups.length; i++) {
			const pu = this.grid.powerups[i];
			if (overlaps(this, pu)) {
				if (pu instanceof Heart && !pu.exploding) {
					pu.explode();
					if (this.life < MAX_LIFE) {
						this.life++;
					}
				}
			}
		}
	}
}

class Minimap {
	constructor(grid) {
		this.grid = grid;
		this.topLeft = new Point(20,20);
		this.rect = new Rect(this.topLeft, 200, 100);
	}

	draw(ctx) {
		// Draw box outline
		ctx.fillStyle = '#000';
		ctx.globalAlpha = 0.2;
		ctx.fillRect(this.topLeft.x, this.topLeft.y, this.rect.width, this.rect.height);
		ctx.globalAlpha = 1;	
		ctx.strokeStyle = '#000';
		ctx.lineWidth = 2;
		ctx.strokeRect(this.topLeft.x, this.topLeft.y, this.rect.width, this.rect.height);
		// Draw outline of grid view
		const x = this.topLeft.x + this.rect.width/2 - this.grid.canvas.width/2/32;
		const y = this.topLeft.y + this.rect.height/2 - this.grid.canvas.height/2/32;
		const w = this.grid.canvas.width/32;
		const h = this.grid.canvas.height/32;
		ctx.strokeStyle = '#000';
		ctx.lineWidth = 1;
		ctx.strokeRect(x, y, w, h);

		// Helper
		const self = this;
		function draw(item) {
			const x = (item.rect.topLeft.x 
				- self.grid.topLeft.x 
				- self.grid.canvas.width/2)/32 
				+ self.rect.width/2
				+ self.topLeft.x;
			const y = (item.rect.topLeft.y 
				- self.grid.topLeft.y
				- self.grid.canvas.height/2)/32 
				+ self.rect.height/2
				+ self.topLeft.y;
			let fs = '#fff';
			if (item instanceof StoneFloor) {
				fs = '#222';
			} else if (item instanceof Bricks) {
				fs = '#d00';
			} else if (item instanceof Crate) {
				fs = '#e0bd61';
			}
			ctx.fillStyle = fs;
			ctx.fillRect(x, y, 2, 2);
		}

		// Draw pixels
		for (const locStr in this.grid.terrain) {
			const item = this.grid.terrain[locStr];
			draw(item);
		}
		this.grid.actors.forEach(a => draw(a));
	}
}

class Grid {
	constructor(canvas, editing) {
		this.canvas = canvas;
		this.topLeft = new Point(0,0);
		this.blockSize = 64;
		this.moveSize = 16; // Should be factor of blockSize
		this.terrain = {};
		this.actors = [];
		this.powerups = [];
		this.clouds = [];
		this.bg = new SunBackground({
			center: new Point(800, 200),
			r: 150,
			sunColor: '#dd3',
			skyColor: '#98f',
			nRays: 10,
			rayTheta: Math.PI/10,
			rotRate: 0.0005,
		}, this);
		this.editing = editing ?? true;
	}

	addCloud(offscreen) {
		let p, good=false;
		outer:
		for (let n=0; n<20; n++) {
			const x = offscreen ? -300 : Math.random()*this.canvas.width;
			const y = Math.random()*2*this.canvas.height/3;
			p = new Point(x, y);
			for (let i=0; i<this.clouds.length; i++) {
				const item = this.clouds[i];
				if (item.topLeft.dist(p) < 200) {
					continue outer;
				}
			}
			good = true
			break;
		}
		if (good) {
			this.clouds.push(new Cloud(p, this));
			this.clouds.sort((a,b) => {
				return a.scale - b.scale;
			});
		}
	}

	addActor(actor, powerup) {
		// Check whether we overlap with anything
		// Terrain
		for (const locStr in this.terrain) {
			const item = this.terrain[locStr];
			if (overlaps(actor, item)) {
				return false;
			}
		}
		// Actors
		for (let i=0; i<this.actors.length; i++) {
			if (overlaps(actor, this.actors[i])) {
				return false;
			}
		}
		// Powerups
		for (let i=0; i<this.powerups.length; i++) {
			if (overlaps(actor, this.powerups[i])) {
				return false;
			}
		}
		if (powerup) {
			this.powerups.push(actor);
		} else {
			this.actors.push(actor);
		}
		return true;
	}

	// Item must be constructed with grid
	addTerrain(item) {
		// Check overlap with actors
		for (let i=0; i<this.actors.length; i++) {
			if (overlaps(item, this.actors[i])) {
				return false;
			}
		}
		// Overplace existing terrain
		this.terrain[item.locStr] = item;
		return true;
	}

	// Special method for determining if actor is close to being on screen
	contains(item, rect) {
		const cs = item.corners;
		for (let i=0; i<4; i++) {
			if (rect.contains(cs[i])) {
				return true;
			}
		}
		return false;
	}

	draw() {
		const ctx = this.canvas.getContext('2d');
		// Draw background
		this.bg.draw(ctx);
		this.clouds.forEach(b => b.draw(ctx));
		// Draw the grid
		if (this.editing) {
			const xMod = this.topLeft.x % this.blockSize;
			const yMod = this.topLeft.y % this.blockSize;
			for (let x = -xMod; x < this.canvas.width; x += this.blockSize) {
				ctx.strokeStyle = '#33a';
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(x, 0);
				ctx.lineTo(x, this.canvas.height);
				ctx.stroke();
			}
			for (let y = -yMod; y < this.canvas.height; y += this.blockSize) {
				ctx.strokeStyle = '#33a';
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(0, y);
				ctx.lineTo(this.canvas.width, y);
				ctx.stroke();
			}
		}
		// Draw terrain
		for (const locStr in this.terrain) {
			const item = this.terrain[locStr];
			item.draw(ctx);
		}
		// Draw powerups
		this.powerups.forEach(p => p.draw(ctx));
		// Draw actors
		this.actors.forEach(a => a.draw(ctx));
	}

	getColliders(actor, existing) {
		if (actor.dead) {
			return [];
		}
		const colliders = [];
		if (existing) {
			existing.forEach(item => {
				if (overlaps(actor, item)) {
					colliders.push(item);
				}
			});
			return colliders;
		}
		for (const locStr in this.terrain) {
			if (overlaps(actor, this.terrain[locStr])) {
				colliders.push(this.terrain[locStr]);
			}
		}
		for (let i=0; i<this.actors.length; i++) {
			if (actor == this.actors[i]) {
				continue;
			}
			if (overlaps(actor, this.actors[i])) {
				colliders.push(this.actors[i]);
			}
		}
		return colliders;
	}

	// p in screen coords
	getGridPoint(p) {
		const x = this.topLeft.x + p.x;
		const y = this.topLeft.y + p.y;
		return new Point(x,y);
	}

	// p in grid coords
	getLoc(p) {
		p = this.getSnapToGrid(p);
		return new Point(p.x / this.blockSize, p.y / this.blockSize);
	}

	// p in grid coords
	getSnapToGrid(p) {
		let modX = p.x % this.blockSize;
		let modY = p.y % this.blockSize;
		if (modX < 0) modX += this.blockSize;
		if (modY < 0) modY += this.blockSize;
		return new Point(p.x - modX, p.y - modY);
	}

	keydown(e) {
		const mult = e.shiftKey ? 8 : 1;
		switch (e.key) {
			case 'ArrowLeft': this.topLeft.x -= mult*this.moveSize; return true;
			case 'ArrowRight': this.topLeft.x += mult*this.moveSize; return true;
			case 'ArrowUp': this.topLeft.y -= mult*this.moveSize; return true;
			case 'ArrowDown': this.topLeft.y += mult*this.moveSize; return true;
		} 
		if (this.player && this.player.keydown(e)) {
			return true;
		}
		return false;
	}

	keyup(e) {
		if (this.player) {
			this.player.keyup(e);
		}
	}

	// Not used
	get screenRect() {
		return new Rect(this.topLeft.clone(), this.canvas.width, this.canvas.height);
	}

	// Item is close to being on screen
	get screenRectWithBuffer() {
		const xc = this.topLeft.x + this.canvas.width/2;
		const yc = this.topLeft.y + this.canvas.height/2;
		const w = this.canvas.width + FAR_AWAY;
		const h = this.canvas.height + FAR_AWAY;
		const topLeft = new Point(xc - w/2, yc - h/2);
		return new Rect(topLeft, w, h);
	}

	tick() {
		const rect = this.screenRectWithBuffer;
		this.actors.forEach(a => {
			if (this.contains(a, rect)) {
				a.tick();
			}
		});
		this.powerups.forEach(p => {
			if (this.contains(p, rect)) {
				p.tick();
			}
		});
		this.clouds.forEach(b => b.tick());
		this.bg.tick();
		for (const locStr in this.terrain) {
			const t = this.terrain[locStr];
			if (t.tick && this.contains(t, rect)) {
				t.tick();
			}
		}
		// Remove clouds
		const keepClouds = [];
		for (let i=0; i<this.clouds.length; i++) {
			if (!this.clouds[i].toRemove) {
				keepClouds.push(this.clouds[i]);
			}
		}
		this.clouds = keepClouds;
		// Spawn new clouds
		// Don't use while loop because it can hang game
		if (this.clouds.length < N_CLOUDS) {
			this.addCloud(true);
		}
	}
}

class PaletteElement {
	constructor(params) {
		this.palette = params.palette;
		this.name = params.name;
		this.img = params.img;
		this.clickFn = params.clickFn;
		this.topLeft = params.topLeft;
		this.hovering = false;
	}

	click(p) {
		if (this.paddedRect.contains(p)) {
			this.clickFn();
			return true;
		}
		return false;
	}

	get mult() {
		const wMult = this.img.width / PALETTE_IMG_SIZE;
		const hMult = this.img.height / PALETTE_IMG_SIZE;
		if (wMult >= hMult && wMult > 1) {
			return wMult;
		}
		if (hMult >= wMult && hMult > 1) {
			return hMult;
		}
		return 1;
	}

	get width() {
		return this.img.width / this.mult;
	}

	get height() {
		return this.img.height / this.mult;
	}

	draw(ctx) {
		const r = this.rect;
		const rp = this.paddedRect;
		ctx.globalAlpha = 0.2;
		if (this.palette.placing == this.name || this.hovering) {
			ctx.fillStyle = '#f00';
			ctx.fillRect(rp.topLeft.x, rp.topLeft.y, rp.width, rp.height);
			ctx.globalAlpha = 1;
			ctx.strokeStyle = '#f00';
			ctx.lineWidth = 2;
			ctx.strokeRect(rp.topLeft.x, rp.topLeft.y, rp.width, rp.height);
		} else {
			ctx.fillStyle = '#333';
			ctx.fillRect(rp.topLeft.x, rp.topLeft.y, rp.width, rp.height);
			ctx.globalAlpha = 1;
			ctx.strokeStyle = '#333';
			ctx.lineWidth = 2;
			ctx.strokeRect(rp.topLeft.x, rp.topLeft.y, rp.width, rp.height);
		}
		ctx.drawImage(this.img, r.topLeft.x, r.topLeft.y, r.width, r.height);
	}

	get rect() {
		const w = this.width;
		const h = this.height;
		const x = this.topLeft.x + PALETTE_WIDTH/2 - w/2;
		const y = this.topLeft.y;
		return new Rect(new Point(x, y), w, h);
	}

	get paddedRect() {
		const r = this.rect;
		const x = r.topLeft.x + r.width/2 - PALETTE_WIDTH/2;
		const y = r.topLeft.y - PALETTE_Y_PAD;
		return new Rect(new Point(x, y), PALETTE_WIDTH, r.height + 2*PALETTE_Y_PAD);
	}

	mousemove(p) {
		this.hovering = this.paddedRect.contains(p);
	}

	mouseout() {
		this.hovering = false;
	}
}

class Palette {
	constructor(params) {
		this.images = params.images;
		this.canvas = params.canvas;
		this.elts = [];
		this.packedElts = [];
		this.firstIdx = 0;
		this.lastIdx = 0; // Updated in pack and used to determine if we can scroll more
		this.placing = '';
		this.scrollUpElt = new PaletteElement({
			palette: this,
			name: 'scroll-up',
			img: this.images['scroll-up'],
			clickFn: () => {
				this.scrollUp();
			},
			topLeft: new Point(
				PALETTE_CENTER_X - PALETTE_WIDTH/2,
				PALETTE_TOP_Y),
		});
		// Top y gets recalculated in pack method
		this.scrollDownElt = new PaletteElement({
			palette: this,
			name: 'scroll-down',
			img: this.images['scroll-down'],
			clickFn: () => {
				this.scrollDown();
			},
			topLeft: new Point(
				PALETTE_CENTER_X - PALETTE_WIDTH/2,
				PALETTE_TOP_Y),
		});
	}

	add(name, img) {
		this.elts.push(new PaletteElement({
			palette: this,
			name,
			img,
			clickFn: () => {
				this.placing = name;
			},
			// topLeft.y recalculated in pack method
			topLeft: new Point(
				PALETTE_CENTER_X - PALETTE_WIDTH/2, 
				PALETTE_TOP_Y),
		}));
		this.pack();
	}

	// Return true if we've hit a palette element
	click(p) {
		for (let i=0; i<this.packedElts.length; i++) {
			const elt = this.packedElts[i];
			if (elt.click(p)) {
				return true;
			}
		}
		return false;
	}

	draw(ctx) {
		this.packedElts.forEach(e => e.draw(ctx));
	}

	mousemove(p) {
		this.packedElts.forEach(e => {
			e.mousemove(p);
		});
	}

	mouseout() {
		this.packedElts.forEach(e => {
			e.mouseout();
		});
	}

	pack() {
		let hUsed = 0;
		hUsed += this.scrollUpElt.paddedRect.height;
		hUsed += this.scrollDownElt.paddedRect.height;
		for (let i=this.firstIdx; i<this.elts.length; i++) {
			const hNew = hUsed + this.elts[i].paddedRect.height;
			if (hNew > this.canvas.height - 2*PALETTE_TOP_Y) {
				break;
			}
			this.lastIdx = i;
			hUsed = hNew;
		}
		const pad = 
			(this.canvas.height - 2*PALETTE_TOP_Y - hUsed) 
			/ (this.lastIdx - this.firstIdx + 2);
		this.packedElts = [this.scrollUpElt];
		let y = PALETTE_TOP_Y + this.scrollUpElt.paddedRect.height;
		for (let i=this.firstIdx; i<=this.lastIdx; i++) {
			const elt = this.elts[i];
			elt.topLeft.y = y + pad;
			this.packedElts.push(elt);
			y += pad + elt.paddedRect.height;
		}
		this.scrollDownElt.topLeft.y = pad + y;
		this.packedElts.push(this.scrollDownElt);
	}

	scrollDown() {
		if (this.lastIdx < this.elts.length-1) {
			this.firstIdx++;
		}
		this.pack();
	}

	scrollUp() {
		if (this.firstIdx > 0) {
			this.firstIdx--;
		}
		this.pack();
	}
}

class HUD {
	constructor(grid, images) {
		this.grid = grid;
		this.images = images;
	}

	draw(ctx) {
		// Player life
		const heart = this.images['heart'];
		const empty = this.images['heart-empty']
		if (this.grid.player && heart && empty) {
			for (let i=0; i<MAX_LIFE; i++) {
				const img = i < this.grid.player.life ? heart : empty;
				const x = this.grid.canvas.width - (HEART_PAD + HEART_SIZE) * (i + 1);
				const y = 20;
				const ow = img.width;
				const oh = img.height;
				const h = HEART_SIZE/ow * oh;
				ctx.drawImage(img, x, y, HEART_SIZE, h);
			}
		}
	}
}

window.addEventListener('load', e => {
	const canvas = $('#editor-canvas');
	const grid = new Grid(canvas);
	const minimap = new Minimap(grid);
	const images = {};
	let palette = null; // Initialize palette only after we've loaded images
	const hud = new HUD(grid, images);

	let nLoaded = 0;
	// Load images
	let imgRes = [
		"delete.png",
		"bricks-1.png", "bricks-2.png", 
		"crate-1.png", "crate-2.png", "crate-3.png",
		"stone-floor.png", "stone-floor-island.png", "stone-floor-left.png", 
		"stone-floor-middle.png", "stone-floor-right.png", 
		"gopher-left.png", "gopher-right.png",
		"mushroom-man-left.png", "mushroom-man-right.png",
		"mushroom-man-boop-left.png", "mushroom-man-boop-right.png",
		"lava-1.png", "lava-2.png", "lava-3.png",
		"scroll-up.png", "scroll-down.png",
		"ziggy-left.png", "ziggy-right.png",
		"heart.png", "heart-empty.png",
	];

	imgRes.forEach(imgFname => {
		const name = imgFname.split(".")[0];
		const img = new Image();
		img.src = 'inkscape/' + imgFname;
		images[name] = img;
		img.addEventListener('load', () => {
			nLoaded++;
			if (nLoaded == imgRes.length) {
				palette = new Palette({images, canvas});
				palette.add('delete', images['delete']);
				palette.add('stone-floor', images['stone-floor']);
				palette.add('bricks', images['bricks-1']);
				palette.add('lava', images['lava-1']);
				palette.add('crate', images['crate-1']);
				palette.add('gopher', images['gopher-right']);
				palette.add('mushroom-man', images['mushroom-man-left']);
				palette.add('ziggy', images['ziggy-left']);
				palette.add('heart', images['heart']);
			}
		});
	});

	for (let i=0; i<N_CLOUDS_START; i++) {
		grid.addCloud();
	}

	document.addEventListener('keydown', e => {
		// Prevent default only if we consume the keypress
		let gc = grid.keydown(e);
		if (gc) {
			e.preventDefault();
		}
	});

	document.addEventListener('keyup', e => {
		grid.keyup(e);
	});

	function tryDelete(p) {
		if (palette.placing == 'delete') {
			const gp = grid.getGridPoint(p);
			const sp = grid.getSnapToGrid(gp);
			const itemLocStr = locStr(grid.getLoc(sp));
			for (const locStr in grid.terrain) {
				if (itemLocStr == locStr) {
					delete grid.terrain[locStr];
				}
			}
			for (let i=0; i<grid.actors.length; i++) {
				if (grid.actors[i].rect.contains(gp)) {
					grid.actors.splice(i, 1);
					break;
				}
			}
			for (let i=0; i<grid.powerups.length; i++) {
				if (grid.powerups[i].rect.contains(gp)) {
					grid.powerups.splice(i, 1);
					break;
				}
			}
		}
	}

	function tryPlaceTerrain(p) {
		const sp = grid.getSnapToGrid(grid.getGridPoint(p));
		if (palette.placing == 'stone-floor') {
			const item = new StoneFloor(
				new Rect(sp, 64, 64),
				grid,
				images);
			grid.addTerrain(item);
		} else if (palette.placing == 'bricks') {
			const item = new Bricks(
				new Rect(sp, 64, 64),
				grid,
				images);
			grid.addTerrain(item);
		} else if (palette.placing == 'lava') {
			const item = new Lava(
				new Rect(sp, 64, 64),
				grid,
				images);
			grid.addTerrain(item);
		}
	}

	function tryPlaceActor(p) {
		const gp = grid.getGridPoint(p);
		if (palette.placing == 'crate') {
			const crate = new Crate(
				new Rect(gp, 
					images['crate-1'].width, 
					images['crate-1'].height),
				grid,
				images);
			grid.addActor(crate);
		} else if (palette.placing == 'gopher') {
			const player = new Player(
				new Rect(gp, 
					images['gopher-right'].width, 
					images['gopher-right'].height),
				grid,
				images);
			grid.addActor(player);
		} else if (palette.placing == 'mushroom-man') {
			const mm = new MushroomMan(
				new Rect(gp,
					images['mushroom-man-left'].width,
					images['mushroom-man-left'].height),
				grid,
				images);
			grid.addActor(mm);
		} else if (palette.placing == 'ziggy') {
			const z = new Ziggy(
				new Rect(gp,
					images['ziggy-left'].width,
					images['ziggy-left'].height),
				grid,
				images);
			grid.addActor(z);
		} else if (palette.placing == 'heart') {
			const h = new Heart(
				new Rect(gp,
					images['heart'].width,
					images['heart'].height),
				grid,
				images);
			grid.addActor(h, true);
		}
	}

	canvas.addEventListener('mousemove', e => {
		const p = new Point(e.offsetX, e.offsetY);
		if (e.buttons === 1) {
			tryDelete(p);
			tryPlaceTerrain(p);
			tryPlaceActor(p);
		} else {
			const gp = grid.getGridPoint(p);
			if (palette) {
				palette.mousemove(p);
			}
		}
	});

	canvas.addEventListener('mouseout', e => {
		palette.mouseout();
	});

	canvas.addEventListener('click', e => {
		const p = new Point(e.offsetX, e.offsetY);
		if (palette.click(p)) {
			return;
		}
		tryDelete(p);
		tryPlaceTerrain(p);
		tryPlaceActor(p);
	});

	function repaint() {
		const ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		grid.draw();
		hud.draw(ctx);
		if (palette) {
			palette.draw(ctx);
		}
		minimap.draw(ctx);
	}

	// Animation
	let lastts;
	const FRAME_TIME = 30;

	function animate(t) {
		if (lastts === undefined) {
			lastts = t;
		}
		const elapsed = t - lastts;
		if (elapsed < FRAME_TIME) {
			requestAnimationFrame(animate);
			return;
		}
		lastts = t;
		grid.tick();
		repaint();
		requestAnimationFrame(animate);
	}

	requestAnimationFrame(animate);
});
