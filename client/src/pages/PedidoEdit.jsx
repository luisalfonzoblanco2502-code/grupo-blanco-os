import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { PedidoForm } from "../components/PedidoForm";
import { useToast } from "../components/ToastContext";

export function PedidoEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { mostrarToast } = useToast();
  const [pedido, setPedido] = useState(null);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.getPedido(id).then(setPedido).catch((err) => setError(err.message));
  }, [id]);

  async function handleSubmit(datos) {
    setError(null);
    setEnviando(true);
    try {
      await api.updatePedido(id, datos);
      mostrarToast("Cambios guardados correctamente");
      navigate(`/pedidos/${id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (!pedido && !error) return <p>Cargando...</p>;

  return (
    <div>
      <h1>Editar pedido {pedido?.pedId}</h1>
      {pedido && (
        <PedidoForm
          valoresIniciales={pedido}
          onSubmit={handleSubmit}
          enviando={enviando}
          error={error}
          textoBoton="Guardar cambios"
        />
      )}
    </div>
  );
}
