export {$, $$, Point, Rect};

const $ = q => document.querySelector(q);
const $$ = q => [...document.querySelectorAll(q)];

class Point {
	constructor(x, y) {
		this.x = x;
		this.y = y;
	}
}

class Rect {
	constructor(topLeft, width, height) {
		this.topLeft = topLeft;
		this.width = width; 
		this.height = height;
	}

	contains(p) {
		const px = p.x;
		const py = p.y;
		const x = this.topLeft.x;
		const y = this.topLeft.y;
		const w = this.width;
		const h = this.height;
		return px >= x && (px <= x+w) && py >= y && (py <= y+h);
	}
}
