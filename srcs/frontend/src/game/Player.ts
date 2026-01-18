type PlayerOptions = {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	x: number;
	y: number;
	height: number;
	width: number;
	speed: number;
	score?: number;
};

export class Player{
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	public x: number;
	public y: number;
	public height: number;
	public width: number;
	public speed: number;
	public score: number;
	private start_y: number;

	constructor({
		canvas,
		ctx,
		x,
		y,
		height,
		width,
		speed,
		score = 0
	}: PlayerOptions)
	{
		this.canvas = canvas;
		this.ctx = ctx;
		this.x = x;
		this.y = y;
		this.height = height;
		this.width = width;
		this.speed = speed;
		this.score = score;
		this.start_y = this.y;
	}

	public update(dir: number, speed: number)
	{
		this.y += dir * speed;
	}

	public goal()
	{
		this.score += 1;
	}

	public draw()
	{
		this.ctx.fillStyle = "black";
		this.ctx.fillRect(this.x, this.y, this.width, this.height);
	}

	public reset()
	{
		this.y = this.start_y;
	}

}
