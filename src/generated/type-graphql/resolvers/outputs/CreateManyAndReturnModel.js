"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateManyAndReturnModel = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
let CreateManyAndReturnModel = class CreateManyAndReturnModel {
};
exports.CreateManyAndReturnModel = CreateManyAndReturnModel;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", Number)
], CreateManyAndReturnModel.prototype, "id", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], CreateManyAndReturnModel.prototype, "name", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", String)
], CreateManyAndReturnModel.prototype, "columnName", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => String, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", String)
], CreateManyAndReturnModel.prototype, "source", void 0);
exports.CreateManyAndReturnModel = CreateManyAndReturnModel = tslib_1.__decorate([
    TypeGraphQL.ObjectType("CreateManyAndReturnModel", {})
], CreateManyAndReturnModel);
