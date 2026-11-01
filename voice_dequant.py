"""
voice_dequant.py — the spell-hearing network for the video card: the int8 model (model.int8.onnx, onnxruntime's dynamic
quantization) rebuilt so that a video card can run it on its own.

Why: in model.int8.onnx every layer is DynamicQuantizeLinear → MatMulInteger / ConvInteger → Cast → Mul (scale). DirectML
does not run these integer layers on the card, so every look went back and forth between the card and the processor and was
no faster than the processor — the game kept the voice on the processor («(процессор)» in every line of the spell journal).
Here each such chain becomes MatMul / Conv over the float activations and the weights dequantized in the graph
(DequantizeLinear: int8 on disk, the same 225 MB file size). The video card's hands network works the same way (float).
The processor keeps the int8 model (quality tests unchanged); the card's letters are checked against it (voice_native.gpu_verdict).

    python voice_dequant.py <model.int8.onnx> <model.gpu.onnx>        (needs the onnx package: vendor/onnx-tools)
"""

import os
import sys


def dequantize(src, dst):
    import onnx
    from onnx import helper, numpy_helper
    m = onnx.load(src)
    g = m.graph
    inits = {i.name: i for i in g.initializer}
    prod = {o: n for n in g.node for o in n.output}
    cons = {}
    for n in g.node:
        for i in n.input:
            cons.setdefault(i, []).append(n)
    drop, add_after = set(), {}
    changed = 0
    for n in g.node:
        if n.op_type not in ("MatMulInteger", "ConvInteger"):
            continue
        aq, wq, azp, wzp = (list(n.input) + ["", "", "", ""])[:4]
        dq = prod.get(aq)
        if dq is None or dq.op_type != "DynamicQuantizeLinear" or wq not in inits:
            continue
        a = dq.input[0]
        out = cons.get(n.output[0], [])
        if len(out) != 1 or out[0].op_type != "Cast":
            continue
        cast = out[0]
        out2 = cons.get(cast.output[0], [])
        if len(out2) != 1 or out2[0].op_type != "Mul":
            continue
        mul = out2[0]
        sm = prod.get(mul.input[1] if mul.input[0] == cast.output[0] else mul.input[0])
        if sm is None or sm.op_type != "Mul":
            continue
        ws = next((i for i in sm.input if i in inits), None)
        if ws is None:
            continue
        # the weight back to float, in the graph: DequantizeLinear(int8 weight, its scale, its zero point)
        w = numpy_helper.to_array(inits[wq])
        scale = numpy_helper.to_array(inits[ws])
        axis = 0 if n.op_type == "ConvInteger" else 1  # (per-channel scales: Conv — the output channels; MatMul — the columns)
        wf = n.output[0] + "_wdeq"
        dq_inputs = [wq, ws] + ([wzp] if wzp else [])
        nodes = [helper.make_node("DequantizeLinear", dq_inputs, [wf], name=wf, **({"axis": axis} if scale.ndim == 1 and scale.size > 1 else {}))]
        if n.op_type == "MatMulInteger":
            nodes.append(helper.make_node("MatMul", [a, wf], [mul.output[0]], name=n.output[0] + "_fmm"))
        else:
            attrs = {x.name: helper.get_attribute_value(x) for x in n.attribute}
            nodes.append(helper.make_node("Conv", [a, wf], [mul.output[0]], name=n.output[0] + "_fconv", **attrs))
        add_after[id(mul)] = nodes
        drop.update({id(n), id(cast), id(mul)})
        changed += 1
    keep = []
    for n in g.node:
        if id(n) in add_after:
            keep.extend(add_after[id(n)])
        if id(n) not in drop:
            keep.append(n)
    del g.node[:]
    g.node.extend(keep)
    # what nothing reads any more: the scale products, the DynamicQuantizeLinear nodes (a few passes: chains)
    outs = {o.name for o in g.output}
    for _ in range(4):
        used = {i for n in g.node for i in n.input} | outs
        rest = [n for n in g.node if any(o in used for o in n.output)]
        if len(rest) == len(g.node):
            break
        del g.node[:]
        g.node.extend(rest)
    used = {i for n in g.node for i in n.input}
    live = [i for i in g.initializer if i.name in used]
    del g.initializer[:]
    g.initializer.extend(live)
    if m.opset_import and m.opset_import[0].version < 13:
        m.opset_import[0].version = 13  # (DequantizeLinear with axis)
    onnx.checker.check_model(m)
    tmp = dst + ".part"
    onnx.save(m, tmp)
    os.replace(tmp, dst)  # (whole or nothing: a half-written file is never used)
    left = sum(1 for n in g.node if n.op_type in ("MatMulInteger", "ConvInteger", "DynamicQuantizeLinear"))
    return changed, left


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    tools = os.path.join(here, "vendor", "onnx-tools")
    if os.path.isdir(tools):
        sys.path.insert(0, tools)
    c, left = dequantize(sys.argv[1], sys.argv[2])
    print(f"replaced {c} integer layers, left {left}")
    sys.exit(0 if left == 0 and c > 0 else 3)
