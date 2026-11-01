"""voice_dequant.py: an int8 model (onnxruntime dynamic quantization: MatMulInteger / ConvInteger) rebuilt with float layers —
no integer layers left, and the outputs are the same as the int8 model's (the video card runs it itself: the voice off the processor)."""
import os
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "vendor", "onnx-tools"))

try:
    import numpy as np
    import onnx
    from onnx import helper, TensorProto, numpy_helper
    import onnxruntime as ort
    from onnxruntime.quantization import quantize_dynamic, QuantType
    HAVE = True
except Exception:  # noqa: BLE001
    HAVE = False


@unittest.skipUnless(HAVE, "onnx / onnxruntime.quantization not installed")
class DequantTest(unittest.TestCase):
    def test_int8_layers_become_float_and_outputs_match(self):
        from voice_dequant import dequantize
        rng = np.random.default_rng(3)
        cw = numpy_helper.from_array(rng.normal(0, 0.3, (16, 8, 3)).astype(np.float32), "cw")
        mw = numpy_helper.from_array(rng.normal(0, 0.3, (16, 12)).astype(np.float32), "mw")
        nodes = [helper.make_node("Conv", ["x", "cw"], ["c"], kernel_shape=[3], pads=[1, 1]),
                 helper.make_node("Transpose", ["c"], ["t"], perm=[0, 2, 1]),
                 helper.make_node("MatMul", ["t", "mw"], ["y"])]
        g = helper.make_graph(nodes, "g", [helper.make_tensor_value_info("x", TensorProto.FLOAT, [1, 8, 20])],
                              [helper.make_tensor_value_info("y", TensorProto.FLOAT, [1, 20, 12])], [cw, mw])
        m = helper.make_model(g, opset_imports=[helper.make_opsetid("", 13)])
        m.ir_version = 8  # (an IR any onnxruntime of the game reads)
        d = tempfile.mkdtemp()
        f32, i8, gpu = (os.path.join(d, n) for n in ("f.onnx", "i8.onnx", "gpu.onnx"))
        onnx.save(m, f32)
        quantize_dynamic(f32, i8, weight_type=QuantType.QUInt8, op_types_to_quantize=["MatMul", "Conv"])
        kinds = {n.op_type for n in onnx.load(i8).graph.node}
        self.assertTrue({"MatMulInteger", "ConvInteger"} & kinds, kinds)
        changed, left = dequantize(i8, gpu)
        self.assertGreater(changed, 0)
        self.assertEqual(left, 0)
        x = rng.normal(0, 1, (1, 8, 20)).astype(np.float32)
        so = ort.SessionOptions()
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC  # (the processor's own fusion would put DequantizeLinear+MatMul back into an int8 MatMul; the video card has no such fusion)
        run = lambda p: ort.InferenceSession(p, so, providers=["CPUExecutionProvider"]).run(None, {"x": x})[0]  # noqa: E731
        a, b = run(i8), run(gpu)
        # exactly the float network over the int8 file's own weights, dequantized (the activations are no longer rounded)
        q = {t.name: numpy_helper.to_array(t) for t in onnx.load(i8).graph.initializer}
        deq = lambda n: (q[n + "_quantized"].astype(np.float32) - q[n + "_zero_point"].astype(np.float32)) * q[n + "_scale"]  # noqa: E731
        m2 = onnx.load(f32)
        for t in m2.graph.initializer:
            t.CopyFrom(numpy_helper.from_array(deq(t.name), t.name))
        f2 = os.path.join(d, "f2.onnx")
        onnx.save(m2, f2)
        exact = run(f2)
        self.assertLess(np.abs(b - exact).max(), 1e-4)
        # and close to what the int8 network says (the processor's letters must match the card's — voice_native.gpu_verdict)
        self.assertLess(np.abs(b - a).max(), 0.1 * np.abs(exact).max())

if __name__ == "__main__":
    unittest.main()
