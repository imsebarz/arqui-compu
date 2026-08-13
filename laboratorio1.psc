Algoritmo SimuladorVonNeumann

	Definir opcionMenu, opcionEjemplo, tipoBase Como Entero
	Definir salir Como Logico
	salir <- Falso
	
	Mientras NO salir Hacer
		Limpiar Pantalla
		Escribir "=========================================================="
		Escribir "         SIMULADOR DE ARQUITECTURA VON NEUMANN            "
		Escribir "=========================================================="
		Escribir ""
		Escribir "--- MAPEO DE OPCODES DE LA ALU ---"
		Escribir "  0001 : LOAD (Cargar en Acumulador)"
		Escribir "  0000 : ADD  (Sumar operando B)"
		Escribir "  0010 : SUB  (Restar operando B)"
		Escribir "  0011 : MUL  (Multiplicar por B)"
		Escribir "  0100 : DIV  (Dividir entre B)"
		Escribir ""
		Escribir "--- SELECCIONE UNA OPCION ---"
		Escribir "1. Cargar Ejemplo 1: Suma (5 + 11)"
		Escribir "2. Cargar Ejemplo 2: Resta (15 - 4)"
		Escribir "3. Cargar Ejemplo 3: Multiplicacion (3 * 4)"
		Escribir "4. Cargar Ejemplo 4: Division (20 / 5)"
		Escribir "5. Salir"
		Escribir ""
		Escribir Sin Saltar "Ingrese su opcion (1-5): "
		Leer opcionMenu
		
		Segun opcionMenu Hacer
			1:
				EjecutarPasoAPaso("SUMA", 5, 11, "0000")
			2:
				EjecutarPasoAPaso("RESTA", 15, 4, "0010")
			3:
				EjecutarPasoAPaso("MULTIPLICACION", 3, 4, "0011")
			4:
				EjecutarPasoAPaso("DIVISION", 20, 5, "0100")
			5:
				salir <- Verdadero
			De Otro Modo:
				Escribir "Opcion no valida. Presione Enter para reintentar."
				Esperar Tecla
		FinSegun
	FinMientras
	
	Limpiar Pantalla
	Escribir "Programa finalizado."
	
FinAlgoritmo

SubProceso EjecutarPasoAPaso(opNombre, numA, numB, opCodeMath)
	Definir paso Como Entero
	Definir teclaPaso Como Cadena
	Definir pc, ri, rdir, rdatos, rentrada, acum, deco Como Cadena
	Definir binA, binB, resultBin Como Cadena
	Definir resultNum Como Entero
	
	binA <- NumeroABinario8Bits(numA)
	binB <- NumeroABinario8Bits(numB)
	
	Si opNombre = "SUMA" Entonces
		resultNum <- numA + numB
	FinSi
	Si opNombre = "RESTA" Entonces
		resultNum <- numA - numB
	FinSi
	Si opNombre = "MULTIPLICACION" Entonces
		resultNum <- numA * numB
	FinSi
	Si opNombre = "DIVISION" Entonces
		resultNum <- TRUNC(numA / numB)
	FinSi
	resultBin <- NumeroABinario8Bits(resultNum)
	
	pc <- "0000"
	ri <- "00000000"
	rdir <- "0000"
	rdatos <- "00000000"
	rentrada <- "00000000"
	acum <- "00000000"
	deco <- "N/A"
	
	Para paso <- 1 Hasta 18 Hacer
		Limpiar Pantalla
		Escribir "=========================================================="
		Escribir "   PANTALLA DE EJECUCION (SIMULANDO CAMBIO DE PESTANA)    "
		Escribir "=========================================================="
		Escribir "Operacion cargada: ", opNombre, " (", numA, " y ", numB, ")"
		Escribir "----------------------------------------------------------"
		
		Segun paso Hacer
			1: rdir <- "0000"
			2: pc <- "0001"
			3: rdatos <- "00010100"
			4: ri <- "00010100"
			5: deco <- "LOAD"
			6: rdir <- "0100"
			7: rdatos <- binA
			8: acum <- binA
			9: rdir <- "0001"
			10: rdatos <- opCodeMath + "0101"
			11: ri <- opCodeMath + "0101"
			12: deco <- opNombre
			13: rdir <- "0101"
			14: rdatos <- binB
			15: rentrada <- binB
			16: // Ejecución interna ALU
			17: acum <- resultBin
			18: // Finalizado
		FinSegun
		
		Escribir "REGISTROS INTERNOS:"
		Escribir "  PC  (Program Counter)       : ", pc
		Escribir "  MAR (Reg. Direcciones)      : ", rdir
		Escribir "  MBR (Reg. Datos/Memoria)    : ", rdatos
		Escribir "  RI  (Reg. Instruccion)      : ", ri
		Escribir "  DECO (Decodificador)        : ", deco
		Escribir "  R. ENTRADA (ALU)            : ", rentrada
		Escribir "  ACUMULADOR (AC)             : ", acum
		Escribir "----------------------------------------------------------"
		Escribir "EXPLICACION DEL PASO ", paso, " DE 18:"
		
		Segun paso Hacer
			1: Escribir "La UC lee la direccion del PC (0000) y la envia al MAR."
			2: Escribir "El PC se incrementa en 1, pasando a 0001."
			3: Escribir "La RAM entrega la instruccion de la celda 0000 al MBR."
			4: Escribir "El dato del MBR se transfiere al Registro de Instrucciones (RI)."
			5: Escribir "El Decodificador interpreta el codigo 0001 como LOAD."
			6: Escribir "Se envia la direccion del Valor A (0100) al MAR."
			7: Escribir "La RAM lee el Valor A (", binA, ") y lo entrega al MBR."
			8: Escribir "El Valor A pasa del MBR al Acumulador (AC)."
			9: Escribir "La UC envia la nueva direccion del PC (0001) al MAR."
			10: Escribir "La RAM entrega la instruccion 2 al MBR."
			11: Escribir "La instruccion pasa del MBR al RI."
			12: Escribir "El Decodificador interpreta el opcode y configura la ALU para ", opNombre, "."
			13: Escribir "Se envia la direccion del Valor B (0101) al MAR."
			14: Escribir "La RAM entrega el Valor B (", binB, ") al MBR."
			15: Escribir "El Valor B pasa al Registro de Entrada de la ALU."
			16: Escribir "La ALU procesa la operacion entre Acumulador y R. Entrada."
			17: Escribir "El resultado (", resultBin, ") se escribe en el Acumulador."
			18: Escribir "CICLO COMPLETADO. Resultado Final = ", resultNum, " (Decimal)."
		FinSegun
		
		Escribir "----------------------------------------------------------"
		Si paso < 18 Entonces
			Escribir "Presione [ENTER] para avanzar al SIGUIENTE PASO..."
			Esperar Tecla
		Sino
			Escribir "Simulacion finalizada. Presione [ENTER] para volver al Menu..."
			Esperar Tecla
		FinSi
	FinPara
FinSubProceso

Funcion binStr <- NumeroABinario8Bits(num)
	Definir binStr Como Cadena
	Definir i, val Como Entero
	binStr <- ""
	val <- num
	Para i <- 1 Hasta 8 Hacer
		binStr <- ConvertirATexto(val % 2) + binStr
		val <- TRUNC(val / 2)
	FinPara
FinFuncion
