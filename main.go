package main

import (
	"io"
	"net/http"
	"os"
	"text/template"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

type Template struct {
	templates *template.Template
}

func (t *Template) Render(w io.Writer, name string, data interface{}, c echo.Context) error {
	return t.templates.ExecuteTemplate(w, name, data)
}

func staticRender(template string) echo.HandlerFunc {
	return func(c echo.Context) error {
		return c.Render(http.StatusOK, template, nil)
	}
}

func main() {
	e := echo.New()
	e.Renderer = &Template{
		templates: template.Must(template.ParseFS(os.DirFS("."), "views/*.html")),
	}

	e.Use(middleware.Logger())
	e.Use(middleware.Secure())
	e.Use(middleware.RemoveTrailingSlash())

	ss := SignalingServer{
		users: []*User{},
		rooms: &RoomService{
			DB: &RoomSlice{
				rooms: []*Room{},
			},
		},
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}

	e.Static("/assets", "static")

	e.GET("/", staticRender("landing"))
	e.GET("/room", staticRender("main"))
	e.GET("/websocket", ss.Handler)

	//e.Logger.Fatal(e.Start(":9090"))
	e.Logger.Fatal(e.Start("localhost:9090"))
}
