export class Ball
{
	private start_y: number;
	private start_x: number;
	private start_dx: number;
	private start_dy: number;
	private start_speed: number;

	constructor(
		private canvas: HTMLCanvasElement,
		private ctx: CanvasRenderingContext2D,
		public x: number,
		public y: number,
		public speed: number,
		public radius: number,
		public dx: number = -1,
		public dy: number = 0
	  )
	  {
		this.start_y = this.y;
		this.start_x = this.x;
		this.start_dx = this.dx;
		this.start_dy = this.dy;
		this.start_speed = this.speed;
	  }

	public draw() {
		this.ctx.fillStyle = "orange";
		this.ctx.beginPath();
		this.ctx.arc(this.x, this.y, this.radius / 2, 0, Math.PI * 2);
		this.ctx.fill();
	}

	public update()
	{
		this.x += this.dx * this.speed;
		this.y += this.dy * this.speed;
	}

	public reset(direction?: number)
	{
		this.x = this.start_x;
		this.y = this.start_y;
		this.dx = direction !== undefined ? direction : this.start_dx;
		this.dy = this.start_dy;
		this.speed = this.start_speed;
	}
}
