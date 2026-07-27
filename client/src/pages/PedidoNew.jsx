import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { PedidoForm } from "../components/PedidoForm";

export function PedidoNew() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(datos) {
    setError(null);
    setEnviando(true);
    try {
      const pedido = await api.createPedido(datos);
      navigate(`/pedidos/${pedido.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <h1>Nuevo pedido</h1>
      <PedidoForm onSubmit={handleSubmit} enviando={enviando} error={error} textoBoton="Crear pedido" />
    </div>
  );
}
