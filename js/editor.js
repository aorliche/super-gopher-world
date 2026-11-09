import {$, $$, Point, Rect} from './util.js';

// Debug
let actorId = 0;
let begin = false;

// Acceleration due to gravity
const G = 1.5;

// For terrain snapping to grid
function locStr(p) {
	return p.x + ',' + p.y;
}

// Slightly inefficient collision detection (don't remember corners)
function overlaps(item1, item2) {
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
			this.move(0, -15);
		}
		const sav = this.rect.topLeft.clone();
		this.vy += G;
		this.rect.topLeft.x += this.vx;
		this.rect.topLeft.y += this.vy;
		const colliders = this.grid.getColliders(this);
		colliders.forEach(c => walkBack(this, c, sav.clone()));
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
	constructor(canvas) {
		this.canvas = canvas;
		this.topLeft = new Point(0,0);
		this.blockSize = 64;
		this.moveSize = 16; // Should be factor of blockSize
		this.terrain = {};
		this.actors = [];
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
		// Draw the grid
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
		// Draw terrain
		for (const locStr in this.terrain) {
			const item = this.terrain[locStr];
			item.draw(ctx);
		}
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

	draw(ctx) {
		if (this.palette.placing == this.name) {
			ctx.strokeStyle = '#f00';
			ctx.lineWidth = 2;
			ctx.strokeRect(
				this.topLeft.x-1, 
				this.topLeft.y-1,
				this.img.width+2,
				this.img.height+2);
		}
		ctx.drawImage(
			this.img,
			this.topLeft.x, 
			this.topLeft.y);
	}

	get rect() {
		if (!this._rect) {
			this._rect = new Rect(this.topLeft, this.img.width, this.img.height);
		}
		return this._rect;
	}
}

class Palette {
	constructor(params) {
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
				this.centerX - img.width/2, 
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
			if (y + this.elts[i].img.height < canvas.height - this.topY - 20) {
				this.elts[i].draw(ctx);
			}
			y += this.elts[i].img.height + 10;
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
	const palette = new Palette();
	const minimap = new Minimap(grid);
	const images = [];

	let nLoaded = 0;
	// Load images
	let imgRes = [
		"delete.png",
		"bricks-1.png", "bricks-2.png", 
		"crate-1.png", "crate-2.png", "crate-3.png",
		"stone-floor.png", "stone-floor-island.png", "stone-floor-left.png", "stone-floor-middle.png",
		"stone-floor-right.png", 
		"gopher-left.png", "gopher-right.png"];

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
			}
		});
	});

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
		if (palette.placing == 'stone-floor') {
			const sp = grid.getSnapToGrid(grid.getGridPoint(p));
			const item = new StoneFloor(
				new Rect(sp, 64, 64),
				grid,
				images);
			grid.addTerrain(item);
		} else if (palette.placing == 'bricks') {
			const sp = grid.getSnapToGrid(grid.getGridPoint(p));
			const item = new Bricks(
				new Rect(sp, 64, 64),
				grid,
				images);
			grid.addTerrain(item);
		}
	}

	function tryPlaceActor(p) {
		if (palette.placing == 'crate') {
			const gp = grid.getGridPoint(p);
			const crate = new Crate(
				new Rect(gp, 
					images['crate-1'].width, 
					images['crate-1'].height),
				grid,
				images);
			grid.addActor(crate);
		} else if (palette.placing == 'gopher') {
			const gp = grid.getGridPoint(p);
			const player = new Player(
				new Rect(gp, 
					images['gopher-right'].width, 
					images['gopher-right'].height),
				grid,
				images);
			grid.addActor(player);
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
