/** Routes use the visible lanes. Each trip starts and ends at named town locations. */
export class TownRoutes {
    constructor(lanes, blocked) {
        this.nodes=[];
        this.edges=[];
        const cells=new Map(), cell=(x,z)=>Math.floor(x/4)+','+Math.floor(z/4);
        const link=(a,b)=>{
            this.edges[a].push(b);
            this.edges[b].push(a);
        };
        for(const lane of lanes){
            let last=-1;
            for(const point of lane){
                const id=this.nodes.length;
                this.nodes.push(point);
                this.edges.push([]);
                const x=Math.floor(point.x/4),z=Math.floor(point.z/4);
                for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
                    for(const other of cells.get((x+dx)+','+(z+dz))||[]){
                        if(other!==last&&this.nodes[other].distanceToSquared(point)<3.15**2&&!blocked(this.nodes[other],point))link(id,other);
                    }
                }
                if(last>=0&&!blocked(this.nodes[last],point))link(id,last);
                const key=cell(point.x,point.z), list=cells.get(key)||[];
                list.push(id);cells.set(key,list);
                last=id;
            }
        }
        this.blocked=blocked;
    }

    nearest(point){
        let nearest=-1, min=12**2;
        for(let i=0;i<this.nodes.length;i++){
            const d=this.nodes[i].distanceToSquared(point);
            if(d<min&&!this.blocked(point,this.nodes[i])){nearest=i;min=d;}
        }
        return nearest;
    }

    between(a,b){
        if(a.distanceToSquared(b)<7**2&&!this.blocked(a,b))return [b];
        const from=this.nearest(a),to=this.nearest(b);
        if(from<0||to<0)return this.blocked(a,b)?[]:[b];
        // The graph is small and shared by all residents; only trips ask for a path.
        const queue=[from], previous=new Map([[from,-1]]);
        for(let i=0;i<queue.length&&!previous.has(to);i++){
            for(const next of this.edges[queue[i]]){
                if(!previous.has(next)){previous.set(next,queue[i]);queue.push(next);}
            }
        }
        if(!previous.has(to))return this.blocked(a,b)?[]:[b];
        const route=[b];
        for(let i=to;i>=0;i=previous.get(i))route.push(this.nodes[i]);
        return route.reverse();
    }
}
