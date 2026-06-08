import {$, $$, Point, Rect} from './util.js';

function locStr(p) {
	return p.x + ',' + p.y;
}

class Terrain {
	constructor(rect, grid, images) {
		this.rect = rect;
		this.grid = grid;
		this.images = images;
		this.loc = grid.getLoc(rect.topLeft);
	}

	get locStr() {
		return locStr(this.loc);
	}
}

class StoneFloor extends Terrain {
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
			offsetY = 0;
		} else if (left instanceof StoneFloor && right instanceof StoneFloor) {
			imgName = 'stone-floor-middle';
			offsetX = 0;
			offsetY = -7;
		} else if (left instanceof StoneFloor) {
			imgName = 'stone-floor-right';
			offsetX = -1;
			offsetY = -7;
		} else if (right instanceof StoneFloor) {
			imgName = 'stone-floor-left';
			offsetX = -4;
			offsetY = -7;
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

class Bricks extends Terrain {
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
		console.log(imgName);
		ctx.drawImage(
			this.images[imgName],
			this.rect.topLeft.x - this.grid.topLeft.x,
			this.rect.topLeft.y - this.grid.topLeft.y,
		)
	}
}

class Grid {
	constructor(canvas) {
		this.canvas = canvas;
		this.topLeft = new Point(0,0);
		this.blockSize = 64;
		this.moveSize = 8; // Should be factor of blockSize
		this.terrain = {};
	}

	// Item must be constructed with grid
	addTerrain(item) {
		this.terrain[item.locStr] = item;
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
		switch (e.key) {
			case 'ArrowLeft': this.topLeft.x -= this.moveSize; return true;
			case 'ArrowRight': this.topLeft.x += this.moveSize; return true;
			case 'ArrowUp': this.topLeft.y -= this.moveSize; return true;
			case 'ArrowDown': this.topLeft.y += this.moveSize; return true;
		} 
		return false;
	}
}

class PaletteElement {
	constructor(params) {
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
		ctx.strokeStyle = '#f00';
		ctx.strokeRect(
			this.topLeft.x-1, 
			this.topLeft.y-1,
			this.img.width+2,
			this.img.height+2);
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

window.addEventListener('load', e => {
	const canvas = $('#editor-canvas');
	const grid = new Grid(canvas);
	const palette = [];
	const images = [];
	let placing = null;

	// Load images
	["bricks-1.png", "bricks-2.png", "crate-1.png", "crate-2.png", "crate-3.png",
		"stone-floor.png", "stone-floor-island.png", "stone-floor-left.png", "stone-floor-middle.png",
		"stone-floor-right.png", "gopher-left.png", "gopher-right.png"]
	.forEach(imgFname => {
		const name = imgFname.split(".")[0];
		const img = new Image();
		img.src = 'inkscape/' + imgFname;
		images[name] = img;
	});

	// Create palette
	const paletteCenterX = 1100;
	let paletteY = 80;
	function addToPalette(name, imgName) {
		const img = images[imgName];
		palette.push(new PaletteElement({
			name,
			img,
			clickFn: () => {
				placing = name;
				console.log(placing);
			},
			topLeft: new Point(
				paletteCenterX - img.width/2, 
				paletteY),
		}));
		paletteY += img.height + 10;
	}

	addToPalette('stone-floor', 'stone-floor');
	addToPalette('bricks', 'bricks-1');
	addToPalette('crate', 'crate-1');
	addToPalette('gopher', 'gopher-right');

	document.addEventListener('keydown', e => {
		// Prevent default only if we consume the keypress
		let gc = grid.keydown(e);
		if (gc) {
			e.preventDefault();
		}
	});

	canvas.addEventListener('click', e => {
		const p = new Point(e.offsetX, e.offsetY);
		for (let i=0; i<palette.length; i++) {
			const elt = palette[i];
			if (elt.click(p)) {
				return;
			}
		}
		// Place on grid
		if (placing == 'stone-floor') {
			const sp = grid.getSnapToGrid(grid.getGridPoint(p));
			const item = new StoneFloor(
				new Rect(sp, 64, 64),
				grid,
				images);
			grid.addTerrain(item);
		} else if (placing == 'bricks') {
			const sp = grid.getSnapToGrid(grid.getGridPoint(p));
			const item = new Bricks(
				new Rect(sp, 64, 64),
				grid,
				images);
			grid.addTerrain(item);
		}
	});

	function repaint() {
		const ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		grid.draw();
		palette.forEach(elt => {
			elt.draw(ctx);
		});
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
		repaint();
		requestAnimationFrame(animate);
	}

	requestAnimationFrame(animate);
});
