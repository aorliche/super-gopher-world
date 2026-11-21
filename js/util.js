export {$, $$, Point, Rect};

const $ = q => document.querySelector(q);
const $$ = q => [...document.querySelectorAll(q)];

class Point {
	constructor(x, y) {
		this.x = x;
		this.y = y;
	}

	add(p) {
		return new Point(this.x+p.x, this.y+p.y);
	}

	clone() {
		return new Point(this.x, this.y);
	}

	dist(p) {
		return this.sub(p).mag();
	}

	dot(p) {
		return this.x*p.x + this.y*p.y;
	}

	mag() {
		return Math.sqrt(this.x*this.x + this.y*this.y);
	}

	scale(a) {
		return new Point(this.x*a, this.y*a);
	}

	sub(p) {
		return new Point(this.x-p.x, this.y-p.y);
	}

	translate(d) {
		this.x += d.x;
		this.y += d.y;
	}
}

class Rect {
	constructor(topLeft, width, height) {
		this.topLeft = topLeft;
		this.width = width; 
		this.height = height;
	}

	clone() {
		return new Rect(this.topLeft.clone(), this.width, this.height);
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

	get hypot() {
		return Math.sqrt(this.width*this.width + this.height*this.height);
	}
}
