# vdom

*A port of Matt-Esch/virtual-dom to Typescript.*

The goal of `vdom` is to implement substantially equivalent functionality
as Matt-Esch/virtual-dom while exposing a typed API. For reference, there is
a reference Typescript definition file describing Matt-Esch/virtual-dom's API
available in `reference/virtual-dom.d.ts`.

While this project can be compiled to raw Javascript it is likely that for now
and the entire forseeable future the original Matt-Esch/virtual-dom project 
will be better tested and have better edge functionality. This project is 
primarily of interest to people doing development in Typescript who want a 
Virtual DOM implementation.

# Authors and Credit

* Original design Matt-Esch, see Matt-Esch/virtual-dom
* Joseph Tel Abrahamson
  * Typescript reference definition file
  * Typescript reimplementation