import {$, $$, Point, Rect} from './util.js';

// Debug
let actorId = 0;
let begin = false;

const G = 1.5;				// Acceleration due to gravity
const FAR_AWAY = 500;		// Collision detection optimization
const VERY_FAR_AWAY = 2000;	// Tick optimization
const N_CLOUDS_START = 10;	// How many clouds we start with
const N_CLOUDS = 12;		// Spawn up to this many clouds beyond left edge

// For terrain snapping to grid
function locStr(p) {
	return p.x + ',' + p.y;
}

// Slightly inefficient collision detection (don't remember corners)
function overlaps(item1, item2) {
	if (item1.rect.topLeft.sub(item2.rect.topLeft).mag() > FAR_AWAY) {
		return false;
	}
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
				grid.actors.splice(i, 1);
				i--;
			}
		}
		this.life = 5;
	}

	// TODO
	die() {
		super.die();
		this.life = 0;
	}

	// TODO
	takeDamage() {
		console.log('damage');
	}

	draw(ctx) {
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

	tick() {
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
				}
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

	addActor(actor) {
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
		this.actors.push(actor);
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
		// Draw actors
		this.actors.forEach(a => a.draw(ctx));
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

	tick() {
		this.actors.forEach(a => a.tick());
		this.clouds.forEach(b => b.tick());
		this.bg.tick();
		for (const locStr in this.terrain) {
			const t = this.terrain[locStr];
			if (t.tick) {
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
	}

	click(p) {
		if (this.rect.contains(p)) {
			this.clickFn();
			return true;
		}
		return false;
	}

	get mult() {
		const wMult = this.img.width / 64;
		const hMult = this.img.height / 64;
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
		if (this.palette.placing == this.name) {
			ctx.strokeStyle = '#f00';
			ctx.lineWidth = 2;
			ctx.strokeRect(r.topLeft.x-1, r.topLeft.y-1, r.width+2, r.height+2);
		}
		ctx.drawImage(this.img, r.topLeft.x, r.topLeft.y, r.width, r.height);
	}

	get rect() {
		const w = this.width;
		const h = this.height;
		const x = this.topLeft.x + 32 - w/2;
		const y = this.topLeft.y;
		return new Rect(new Point(x, y), w, h);
	}
}

class Palette {
	constructor(params) {
		this.images = params.images;
		this.centerX = 1120;
		this.topY = 20;
		this.width = 120;
		this.elts = [];
		this.firstIdx = 0;
		this.placing = '';
	}

	add(name, img) {
		this.elts.push(new PaletteElement({
			palette: this,
			name,
			img,
			clickFn: () => {
				this.placing = name;
			},
			// this.topY recalculated in draw method
			topLeft: new Point(
				this.centerX - 32, 
				this.topY),
		}));
	}

	// Return true if we've hit a palette element
	click(p) {
		for (let i=0; i<this.elts.length; i++) {
			const elt = this.elts[i];
			if (elt.click(p)) {
				return true;
			}
		}
		return false;
	}

	draw(ctx) {
		const canvas = $('#editor-canvas');
		// Draw background
		ctx.globalAlpha = 0.2;
		ctx.fillStyle = '#000';
		ctx.fillRect(this.centerX-this.width/2, this.topY, this.width, canvas.height-2*this.topY);
		ctx.globalAlpha = 1;
		ctx.strokeStyle = '#000';
		ctx.strokeRect(this.centerX-this.width/2, this.topY, this.width, canvas.height-2*this.topY);
		// Recalculate y positions and draw
		let y = this.topY + 20;
		for (let i=this.firstIdx; i<this.elts.length; i++) {
			this.elts[i].topLeft.y = y;
			// Don't run over screen bottom
			if (y + this.elts[i].height < canvas.height - this.topY - 20) {
				this.elts[i].draw(ctx);
			}
			y += this.elts[i].height + 10;
		}
		// Move earlier elements out of screen
		for (let i=0; i<this.firstIdx; i++) {
			this.elts[i].topLeft.y = -1000;
		}
	}

	scrollDown() {
		if (this.firstIdx < this.elts.length-1) {
			this.firstIdx++;
		}
	}

	scrollUp() {
		if (this.firstIdx > 0) {
			this.firstIdx--;
		}
	}
}

window.addEventListener('load', e => {
	const canvas = $('#editor-canvas');
	const grid = new Grid(canvas);
	const minimap = new Minimap(grid);
	const images = {};
	const palette = new Palette({images});

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
	];

	imgRes.forEach(imgFname => {
		const name = imgFname.split(".")[0];
		const img = new Image();
		img.src = 'inkscape/' + imgFname;
		images[name] = img;
		img.addEventListener('load', () => {
			nLoaded++;
			if (nLoaded == imgRes.length) {
				palette.add('delete', images['delete']);
				palette.add('stone-floor', images['stone-floor']);
				palette.add('bricks', images['bricks-1']);
				palette.add('crate', images['crate-1']);
				palette.add('gopher', images['gopher-right']);
				palette.add('mushroom-man', images['mushroom-man-left']);
				palette.add('lava', images['lava-1']);
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
		}
	}

	canvas.addEventListener('mousemove', e => {
		if (e.buttons === 1) {
			const p = new Point(e.offsetX, e.offsetY);
			tryDelete(p);
			tryPlaceTerrain(p);
			tryPlaceActor(p);
		}
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
		palette.draw(ctx);
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
